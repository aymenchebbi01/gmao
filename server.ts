import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import fs from 'fs';
import db, { DB_PATH, reloadDb } from './db.js';
import os from 'os';
import { sendPurchaseRequestNotification } from './email.js';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5033;
const JWT_SECRET = process.env.JWT_SECRET || 'gmao-pro-secret-key-2026';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Ensure 3D coordinates column exists
try {
  const tableInfo = db.prepare("PRAGMA table_info(machines)").all();
  const hasPosition3d = tableInfo.some((col: any) => col.name === 'position3d');
  if (!hasPosition3d) {
    db.prepare("ALTER TABLE machines ADD COLUMN position3d TEXT").run();
    console.log("Added position3d column to machines table");
  }
  const hasSiteNumber = tableInfo.some((col: any) => col.name === 'siteNumber');
  if (!hasSiteNumber) {
    db.prepare("ALTER TABLE machines ADD COLUMN siteNumber VARCHAR(255)").run();
    console.log("Added siteNumber column to machines table");
  }

  const hasInstallationDate = tableInfo.some((col: any) => col.name === 'installationDate');
  if (!hasInstallationDate) {
    db.prepare("ALTER TABLE machines ADD COLUMN installationDate TEXT").run();
    console.log("Added installationDate column to machines table");
  }

  const hasCurrentMoule = tableInfo.some((col: any) => col.name === 'currentMoule');
  if (!hasCurrentMoule) {
    db.prepare("ALTER TABLE machines ADD COLUMN currentMoule TEXT").run();
    console.log("Added currentMoule column to machines table");
  }

  const hasStatusReason = tableInfo.some((col: any) => col.name === 'statusReason');
  if (!hasStatusReason) {
    db.prepare("ALTER TABLE machines ADD COLUMN statusReason TEXT").run();
    console.log("Added statusReason column to machines table");
  }

  // New table for production history (tracking product/mold changes)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS machine_production_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machineId TEXT NOT NULL,
      productName TEXT,
      mouleName TEXT,
      startDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      endDate DATETIME
    )
  `).run();

  // New products table for production items
  db.prepare(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(255) PRIMARY KEY,
      item VARCHAR(255) NOT NULL,
      description TEXT,
      color VARCHAR(100),
      cycleTime DOUBLE DEFAULT 0,
      qtyProduced INT DEFAULT 0,
      priceTN DOUBLE DEFAULT 0,
      priceMalta DOUBLE DEFAULT 0,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // New purchase_requests table for PR history
  db.prepare(`
    CREATE TABLE IF NOT EXISTS purchase_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      requested_by TEXT,
      department TEXT,
      supplier TEXT,
      items_count INTEGER,
      pdf_data TEXT,
      status TEXT DEFAULT 'Waiting for validation',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  try {
    db.prepare(`ALTER TABLE purchase_requests ADD COLUMN status TEXT DEFAULT 'Waiting for validation'`).run();
  } catch (e) {
    // Column already exists, ignore
  }

} catch (error) {
  console.error("Migration error:", error);
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir));

// --- Audit Logging Helper ---
function logAction(userId: string | undefined, username: string | undefined, action: string, entityType: string, entityId: string, details: string) {
  try {
    db.prepare(
      'INSERT INTO audit_logs (userId, username, action, entityType, entityId, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, username, action, entityType, entityId, details);
  } catch (error) {
    console.error('Audit logging failed:', error);
  }
}

/**
 * Reads the JWT cookie from a request and returns the caller's identity.
 * Falls back to { userId: undefined, userName: 'System', isAdmin: false }
 * when the cookie is absent or invalid — so legacy anonymous callers are
 * still labelled "System" while every authenticated action carries the
 * real user's name.
 */
function getCallerIdentity(req: any): { userId: string | undefined; userName: string; isAdmin: boolean; role: string } {
  const token = req.cookies?.token;
  if (!token) return { userId: undefined, userName: 'System', isAdmin: false, role: 'anonymous' };
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded && decoded.uid) {
      return {
        userId: decoded.uid,
        userName: decoded.displayName || decoded.username || 'Unknown',
        isAdmin: decoded.role === 'admin',
        role: decoded.role || 'technician',
      };
    }
  } catch {
    // invalid / expired token — treat as anonymous
  }
  return { userId: undefined, userName: 'System', isAdmin: false, role: 'anonymous' };
}

function getChangesString(entityType: string, entityName: string, oldObj: any, newObj: any): string {
  const changes: string[] = [];
  const ignoredKeys = [
    // Identity / metadata
    'id', 'createdAt', 'updatedAt', 'userId', 'uid',
    // JSON blobs — too noisy / useless as plain text
    'preventivePlan', 'position3d', 'childFaultIds', 'intervention',
    // System-generated telemetry — updated automatically, not by users
    'currentHours', 'lastHoursUpdate', 'totalOperatingTime', 'totalDownTime',
    'failureCount', 'operationalStartTime', 'lastHoursSync',
  ];
  for (const key of Object.keys(newObj)) {
    if (ignoredKeys.includes(key)) continue;
    if (oldObj && oldObj[key] != newObj[key] && newObj[key] !== undefined) {
      const oldVal = oldObj[key] !== null && oldObj[key] !== undefined && oldObj[key] !== '' ? oldObj[key] : 'None';
      const newVal = newObj[key] !== null && newObj[key] !== undefined && newObj[key] !== '' ? newObj[key] : 'None';
      changes.push(`'${key}' changed from '${oldVal}' to '${newVal}'`);
    }
  }
  let baseMsg = `Updated ${entityType} "${entityName}"`;
  if (changes.length > 0) {
    return `${baseMsg} - ${changes.join(', ')}`;
  }
  return null; // Return null if no non-ignored changes found
}

// --- Auth Routes ---

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;

    // Check if user exists
    const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const uid = Math.random().toString(36).substring(2, 15);

    db.prepare(
      'INSERT INTO users (uid, username, password, displayName, role) VALUES (?, ?, ?, ?, ?)'
    ).run(uid, username, password, displayName, role);

    logAction(uid, username, 'Signup', 'User', uid, `User ${username} signed up`);

    const user = { uid, username, displayName, role };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({ user });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (password !== user.password) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const userProfile = {
      uid: user.uid,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    };

    const token = jwt.sign(userProfile, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    logAction(user.uid, user.username, 'Login', 'User', user.uid, `User ${user.username} logged in`);

    res.json({ user: userProfile });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

app.get('/api/auth/me', (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    res.json({ user: decoded });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// --- API Routes ---

// Purchase Requests API
app.get('/api/purchase-requests', (req, res) => {
  try {
    const requests = db.prepare('SELECT * FROM purchase_requests ORDER BY id DESC').all();
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/purchase-requests/last-ref', (req, res) => {
  try {
    const last = db.prepare('SELECT reference FROM purchase_requests ORDER BY id DESC LIMIT 1').get() as { reference: string } | undefined;
    res.json({ lastRef: last ? last.reference : null });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/purchase-requests', (req, res) => {
  const { reference, date, requested_by, department, supplier, items_count, pdf_data, status } = req.body;
  const finalStatus = status || 'Waiting for validation';
  try {
    const info = db.prepare(`
      INSERT INTO purchase_requests (reference, date, requested_by, department, supplier, items_count, pdf_data, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(reference, date, requested_by, department, supplier, items_count, pdf_data, finalStatus);

    res.json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/purchase-requests/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const request = db.prepare('SELECT * FROM purchase_requests WHERE id = ?').get(id) as any;
    if (!request) {
      return res.status(404).json({ error: 'Purchase request not found' });
    }

    await sendPurchaseRequestNotification({
      reference: request.reference,
      date: request.date,
      requestedBy: request.requested_by,
      department: request.department,
      itemsCount: request.items_count,
      supplier: request.supplier,
      pdfData: request.pdf_data || null
    });

    res.json({ message: 'Email sent successfully to accounting department' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/purchase-requests/:id', (req, res) => {
  const { id } = req.params;
  const { reference, date, requested_by, department, supplier, items_count, pdf_data, status } = req.body;
  try {
    db.prepare(`
      UPDATE purchase_requests
      SET reference = ?, date = ?, requested_by = ?, department = ?, supplier = ?, items_count = ?, pdf_data = ?, status = COALESCE(?, status, 'Waiting for validation')
      WHERE id = ?
    `).run(reference, date, requested_by, department, supplier, items_count, pdf_data, status, id);
    res.json({ message: 'Purchase request updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.patch('/api/purchase-requests/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    db.prepare(`
      UPDATE purchase_requests
      SET status = ?
      WHERE id = ?
    `).run(status, id);
    res.json({ message: 'Purchase request status updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/purchase-requests/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM purchase_requests WHERE id = ?').run(id);
    res.json({ message: 'Purchase request deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/server-ip', (req, res) => {
  const interfaces = os.networkInterfaces();
  let ipAddress = 'localhost';
  for (const name of Object.keys(interfaces)) {
    const netInterface = interfaces[name];
    if (netInterface) {
      for (const net of netInterface) {
        if (net.family === 'IPv4' && !net.internal) {
          ipAddress = net.address;
          break;
        }
      }
    }
    if (ipAddress !== 'localhost') break;
  }
  res.json({ ip: ipAddress, port: PORT });
});

// Machines
app.get('/api/machines', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM machines').all() as any[];
    const parsed = rows.map(row => ({
      ...row,
      preventivePlan: row.preventivePlan ? JSON.parse(row.preventivePlan) : [],
      position3d: row.position3d ? JSON.parse(row.position3d) : null
    }));
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/machines', (req, res) => {
  try {
    const { role } = getCallerIdentity(req);
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: 'Forbidden: Manager or Admin role required' });
    }
    const machine = { ...req.body };
    if (machine.preventivePlan) {
      machine.preventivePlan = JSON.stringify(machine.preventivePlan);
    }
    const columns = Object.keys(machine).join(', ');
    const placeholders = Object.keys(machine).map(() => '?').join(', ');
    const values = Object.values(machine);

    db.prepare(`INSERT INTO machines (${columns}) VALUES (${placeholders})`).run(...values);

    const { userId: cUserId, userName: cUserName } = getCallerIdentity(req);
    logAction(cUserId, cUserName, 'Create', 'Machine', machine.id, `Created Machine "${machine.name || machine.serialNumber}"`);

    // Log initial condition
    if (machine.condition) {
      db.prepare(`
        INSERT INTO machine_condition_history (machineId, previousCondition, newCondition)
        VALUES (?, ?, ?)
      `).run(machine.id, null, machine.condition);
    }

    // Log initial production info
    if (machine.injectingProduct || machine.currentMoule) {
      db.prepare(`
        INSERT INTO machine_production_history (machineId, productName, mouleName, startDate)
        VALUES (?, ?, ?, ?)
      `).run(machine.id, machine.injectingProduct || '', machine.currentMoule || '', new Date().toISOString());
    }

    res.status(201).json({ message: 'Machine created' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/machines/:id', (req, res) => {
  try {
    const { role } = getCallerIdentity(req);
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: 'Forbidden: Manager or Admin role required' });
    }
    const { id } = req.params;
    const machine = { ...req.body };
    machine.updatedAt = new Date().toISOString();

    const oldMachine = db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as any;

    // Log condition change
    if (machine.condition !== undefined) {
      if (oldMachine && oldMachine.condition !== machine.condition) {
        db.prepare(`
          INSERT INTO machine_condition_history (machineId, previousCondition, newCondition)
          VALUES (?, ?, ?)
        `).run(id, oldMachine.condition, machine.condition);
      }
    }

    // Log production change (Product or Mold)
    if (machine.injectingProduct !== undefined || machine.currentMoule !== undefined) {
      const newProduct = machine.injectingProduct !== undefined ? machine.injectingProduct : (oldMachine ? oldMachine.injectingProduct : undefined);
      const newMoule = machine.currentMoule !== undefined ? machine.currentMoule : (oldMachine ? oldMachine.currentMoule : undefined);

      if (oldMachine && (oldMachine.injectingProduct !== newProduct || oldMachine.currentMoule !== newMoule)) {
        // End the previous history entry
        db.prepare('UPDATE machine_production_history SET endDate = ? WHERE machineId = ? AND endDate IS NULL').run(new Date().toISOString(), id);

        // Start a new history entry
        db.prepare(`
          INSERT INTO machine_production_history (machineId, productName, mouleName, startDate)
          VALUES (?, ?, ?, ?)
        `).run(id, newProduct || '', newMoule || '', new Date().toISOString());
      }
    }

    if (machine.preventivePlan) {
      machine.preventivePlan = JSON.stringify(machine.preventivePlan);
    }
    if (machine.position3d) {
      machine.position3d = JSON.stringify(machine.position3d);
    }
    const sets = Object.keys(machine).map(key => `${key} = ?`).join(', ');
    const values = Object.values(machine);

    let userId = 'System';
    let userName = 'System';
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded && decoded.uid) {
          userId = decoded.uid;
          userName = decoded.username || decoded.name || 'User';
        }
      } catch (e) {
        console.error("Token verification failed in update machine", e);
      }
    }

    db.prepare(`UPDATE machines SET ${sets} WHERE id = ?`).run(...values, id);
    const entityName = oldMachine ? (oldMachine.name || oldMachine.serialNumber) : id;
    const detailsMsg = getChangesString('Machine', entityName, oldMachine, machine);
    if (detailsMsg) {
      logAction(userId === 'System' ? undefined : userId, userName, 'Update', 'Machine', id, detailsMsg);
    }
    res.json({ message: 'Machine updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/machines/:id/condition-history', (req, res) => {
  try {
    const { id } = req.params;
    const rows = db.prepare('SELECT * FROM machine_condition_history WHERE machineId = ? ORDER BY timestamp DESC').all(id);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/machine-condition-history/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { previousCondition, newCondition, timestamp } = req.body;

    let isAdmin = false;
    let userId = 'System';
    let userName = 'System';
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded && decoded.uid) {
          userId = decoded.uid;
          userName = decoded.username || decoded.displayName || decoded.name || 'User';
          isAdmin = decoded.role === 'admin';
        }
      } catch (e) {
        console.error("Token verification failed", e);
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }

    const oldEntry = db.prepare('SELECT * FROM machine_condition_history WHERE id = ?').get(id) as any;
    if (!oldEntry) {
      return res.status(404).json({ error: 'Condition history entry not found' });
    }

    db.prepare(`
      UPDATE machine_condition_history
      SET previousCondition = ?, newCondition = ?, timestamp = ?
      WHERE id = ?
    `).run(previousCondition, newCondition, timestamp, id);

    logAction(
      userId === 'System' ? undefined : userId,
      userName,
      'Update',
      'MachineConditionHistory',
      id,
      `Updated Condition History for machine ${oldEntry.machineId} (New Condition: "${newCondition}")`
    );

    res.json({ message: 'Condition history entry updated successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/machine-condition-history/:id', (req, res) => {
  try {
    const { id } = req.params;

    let isAdmin = false;
    let userId = 'System';
    let userName = 'System';
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded && decoded.uid) {
          userId = decoded.uid;
          userName = decoded.username || decoded.displayName || decoded.name || 'User';
          isAdmin = decoded.role === 'admin';
        }
      } catch (e) {
        console.error("Token verification failed", e);
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }

    const oldEntry = db.prepare('SELECT * FROM machine_condition_history WHERE id = ?').get(id) as any;
    if (!oldEntry) {
      return res.status(404).json({ error: 'Condition history entry not found' });
    }

    db.prepare('DELETE FROM machine_condition_history WHERE id = ?').run(id);

    logAction(
      userId === 'System' ? undefined : userId,
      userName,
      'Delete',
      'MachineConditionHistory',
      id,
      `Deleted Condition History entry (ID: ${id}) for machine ${oldEntry.machineId}`
    );

    res.json({ message: 'Condition history entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/machines/:id/production-history', (req, res) => {
  try {
    const { id } = req.params;
    const rows = db.prepare('SELECT * FROM machine_production_history WHERE machineId = ? ORDER BY startDate DESC').all(id);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/machine-production-history/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { productName, mouleName, startDate, endDate } = req.body;

    let isAdmin = false;
    let userId = 'System';
    let userName = 'System';
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded && decoded.uid) {
          userId = decoded.uid;
          userName = decoded.username || decoded.displayName || decoded.name || 'User';
          isAdmin = decoded.role === 'admin';
        }
      } catch (e) {
        console.error("Token verification failed", e);
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }

    const oldEntry = db.prepare('SELECT * FROM machine_production_history WHERE id = ?').get(id) as any;
    if (!oldEntry) {
      return res.status(404).json({ error: 'Production history entry not found' });
    }

    db.prepare(`
      UPDATE machine_production_history
      SET productName = ?, mouleName = ?, startDate = ?, endDate = ?
      WHERE id = ?
    `).run(productName, mouleName, startDate, endDate, id);

    logAction(
      userId === 'System' ? undefined : userId,
      userName,
      'Update',
      'MachineProductionHistory',
      id,
      `Updated Production History for machine ${oldEntry.machineId} (Product: "${productName}", Mold: "${mouleName}")`
    );

    res.json({ message: 'Production history entry updated successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/machine-production-history/:id', (req, res) => {
  try {
    const { id } = req.params;

    let isAdmin = false;
    let userId = 'System';
    let userName = 'System';
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded && decoded.uid) {
          userId = decoded.uid;
          userName = decoded.username || decoded.displayName || decoded.name || 'User';
          isAdmin = decoded.role === 'admin';
        }
      } catch (e) {
        console.error("Token verification failed", e);
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }

    const oldEntry = db.prepare('SELECT * FROM machine_production_history WHERE id = ?').get(id) as any;
    if (!oldEntry) {
      return res.status(404).json({ error: 'Production history entry not found' });
    }

    db.prepare('DELETE FROM machine_production_history WHERE id = ?').run(id);

    logAction(
      userId === 'System' ? undefined : userId,
      userName,
      'Delete',
      'MachineProductionHistory',
      id,
      `Deleted Production History entry (ID: ${id}) for machine ${oldEntry.machineId}`
    );

    res.json({ message: 'Production history entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/machines', (req, res) => {
  try {
    const { isAdmin } = getCallerIdentity(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
    db.prepare('DELETE FROM machines').run();
    db.prepare('DELETE FROM machine_production_history').run();
    const { userId: dMUserId, userName: dMUserName } = getCallerIdentity(req);
    logAction(dMUserId, dMUserName, 'Delete', 'Machine', 'all', 'Cleared all machines');
    res.json({ message: 'All machines deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/machines/:id', (req, res) => {
  try {
    const { isAdmin } = getCallerIdentity(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
    const { id } = req.params;
    const oldMachine = db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM machines WHERE id = ?').run(id);
    const entityName = oldMachine ? (oldMachine.name || oldMachine.serialNumber) : id;
    const { userId: dMUserId, userName: dMUserName } = getCallerIdentity(req);
    logAction(dMUserId, dMUserName, 'Delete', 'Machine', id, `Deleted Machine "${entityName}"`);
    res.json({ message: 'Machine deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Interventions
app.get('/api/interventions', (req, res) => {
  const { from, to } = req.query;
  try {
    if (!from || !to) {
      return res.status(400).json({ error: "Missing 'from' or 'to' parameters" });
    }
    const rows = db.prepare(`
      SELECT 
        w.id,
        w.type,
        w.machineId,
        m.name AS machineName,
        w.assignedTo AS technicianId,
        u.displayName AS technicianName,
        COALESCE(w.date, w.createdAt) AS scheduledAt,
        w.completedAt,
        w.status,
        w.id AS woId
      FROM work_orders w
      LEFT JOIN machines m ON w.machineId = m.id
      LEFT JOIN users u ON w.assignedTo = u.uid
    `).all() as any[];

    const filtered = rows.filter(row => {
      const sched = row.scheduledAt ? row.scheduledAt.substring(0, 10) : '';
      const compl = row.completedAt ? row.completedAt.substring(0, 10) : '';
      const isSchedInRange = sched && sched >= from && sched <= to;
      const isComplInRange = compl && compl >= from && compl <= to;
      return isSchedInRange || isComplInRange;
    });

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Work Orders
app.get('/api/work-orders', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM work_orders').all() as any[];
    const parsed = rows.map(row => ({
      ...row,
      intervention: row.intervention ? JSON.parse(row.intervention) : null,
      childFaultIds: row.childFaultIds ? JSON.parse(row.childFaultIds) : []
    }));
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/work-orders', (req, res) => {
  try {
    const workOrder = { ...req.body };
    if (workOrder.intervention) {
      workOrder.intervention = JSON.stringify(workOrder.intervention);
    }
    if (workOrder.childFaultIds) {
      workOrder.childFaultIds = JSON.stringify(workOrder.childFaultIds);
    }
    const columns = Object.keys(workOrder).join(', ');
    const placeholders = Object.keys(workOrder).map(() => '?').join(', ');
    const values = Object.values(workOrder);

    db.prepare(`INSERT INTO work_orders (${columns}) VALUES (${placeholders})`).run(...values);
    const { userId: cWoUserId, userName: cWoUserName } = getCallerIdentity(req);
    logAction(cWoUserId, cWoUserName, 'Create', 'WorkOrder', workOrder.id, `Created Work Order "${workOrder.title}"`);
    res.status(201).json({ message: 'Work order created' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/work-orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const workOrder = { ...req.body };
    workOrder.updatedAt = new Date().toISOString();

    const oldWorkOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) as any;

    // Sync with intervention_reports table for analytics
    if (workOrder.intervention) {
      const report = workOrder.intervention;
      const reportData = {
        workOrderId: id,
        issuerName: report.issuerName,
        issuerSector: report.issuerSector,
        requesterName: report.requesterName,
        requestDate: report.requestDate,
        technicians: report.technicians,
        system: report.system,
        date: report.date,
        location: report.location,
        malfunctionDescription: report.malfunctionDescription,
        replacement: report.replacement ? 1 : 0,
        diagnostic: report.diagnostic ? 1 : 0,
        improvement: report.improvement ? 1 : 0,
        control: report.control ? 1 : 0,
        maintenanceType: report.maintenanceType,
        failureCause: report.failureCause,
        relatedCause: report.relatedCause,
        interventionTime: report.interventionTime,
        actions: report.actions,
        difficulties: report.difficulties,
        startTime: report.startTime,
        endTime: report.endTime,
        durationMinutes: report.durationMinutes,
        comments: report.comments,
        completedAt: report.completedAt || new Date().toISOString()
      };

      const columns = Object.keys(reportData).join(', ');
      const placeholders = Object.keys(reportData).map(() => '?').join(', ');
      const values = Object.values(reportData);

      db.prepare(`INSERT OR REPLACE INTO intervention_reports (${columns}) VALUES (${placeholders})`).run(...values);

      // Handle spare parts
      if (report.partsUsed && Array.isArray(report.partsUsed)) {
        db.prepare('DELETE FROM intervention_parts WHERE workOrderId = ?').run(id);
        const insertPart = db.prepare('INSERT INTO intervention_parts (workOrderId, partId, quantity) VALUES (?, ?, ?)');
        for (const part of report.partsUsed) {
          insertPart.run(id, part.partId, part.quantity);
        }
      }

      workOrder.intervention = JSON.stringify(workOrder.intervention);
    }

    if (workOrder.childFaultIds) {
      workOrder.childFaultIds = JSON.stringify(workOrder.childFaultIds);
    }

    const sets = Object.keys(workOrder).map(key => `${key} = ?`).join(', ');
    const values = Object.values(workOrder);

    db.prepare(`UPDATE work_orders SET ${sets} WHERE id = ?`).run(...values, id);
    const entityName = oldWorkOrder ? oldWorkOrder.title : id;
    const detailsMsg = getChangesString('Work Order', entityName, oldWorkOrder, workOrder);
    if (detailsMsg) {
      const { userId: uWoUserId, userName: uWoUserName } = getCallerIdentity(req);
      logAction(uWoUserId, uWoUserName, 'Update', 'WorkOrder', id, detailsMsg);
    }
    res.json({ message: 'Work order updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/work-orders/:id', (req, res) => {
  try {
    const { isAdmin } = getCallerIdentity(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
    const { id } = req.params;
    const oldWorkOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM work_orders WHERE id = ?').run(id);
    const entityName = oldWorkOrder ? oldWorkOrder.title : id;
    const { userId: dWoUserId, userName: dWoUserName } = getCallerIdentity(req);
    logAction(dWoUserId, dWoUserName, 'Delete', 'WorkOrder', id, `Deleted Work Order "${entityName}"`);
    res.json({ message: 'Work order deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Spare Parts
app.get('/api/spare-parts', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM spare_parts').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Products (Production Items)
app.get('/api/products', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM products ORDER BY item ASC').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const { role } = getCallerIdentity(req);
    if (role === 'anonymous') {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const insert = db.prepare(`
      INSERT OR REPLACE INTO products (id, item, description, color, cycleTime, qtyProduced, priceTN, priceMalta, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((products) => {
      for (const p of products) {
        insert.run(
          p.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          p.item,
          p.description || '',
          p.color || '',
          p.cycleTime || 0,
          p.qtyProduced || 0,
          p.priceTN || 0,
          p.priceMalta || 0,
          new Date().toISOString()
        );
      }
    });

    transaction(items);
    res.status(201).json({ message: `${items.length} products saved` });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/products/:id', (req, res) => {
  try {
    const { role } = getCallerIdentity(req);
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: 'Forbidden: Manager or Admin role required' });
    }
    const { id } = req.params;
    const updates = req.body;
    updates.updatedAt = new Date().toISOString();

    const sets = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);

    db.prepare(`UPDATE products SET ${sets} WHERE id = ?`).run(...values, id);
    res.json({ message: 'Product updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/products/:id', (req, res) => {
  try {
    const { role } = getCallerIdentity(req);
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: 'Forbidden: Manager or Admin role required' });
    }
    const { id } = req.params;
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/spare-parts', (req, res) => {
  try {
    const { role } = getCallerIdentity(req);
    if (role === 'anonymous') {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    const part = req.body;
    const columns = Object.keys(part).join(', ');
    const placeholders = Object.keys(part).map(() => '?').join(', ');
    const values = Object.values(part);

    db.prepare(`INSERT INTO spare_parts (${columns}) VALUES (${placeholders})`).run(...values);
    const { userId: cSpUserId, userName: cSpUserName } = getCallerIdentity(req);
    logAction(cSpUserId, cSpUserName, 'Create', 'SparePart', part.id, `Created Spare Part "${part.name}"`);
    res.status(201).json({ message: 'Spare part created' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/spare-parts/:id', (req, res) => {
  try {
    const { role } = getCallerIdentity(req);
    if (role === 'anonymous') {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }
    const { id } = req.params;
    const part = { ...req.body };
    part.updatedAt = new Date().toISOString();

    const oldPart = db.prepare('SELECT * FROM spare_parts WHERE id = ?').get(id) as any;

    const sets = Object.keys(part).map(key => `${key} = ?`).join(', ');
    const values = Object.values(part);

    db.prepare(`UPDATE spare_parts SET ${sets} WHERE id = ?`).run(...values, id);
    const entityName = oldPart ? oldPart.name : id;
    const detailsMsg = getChangesString('Spare Part', entityName, oldPart, part);
    if (detailsMsg) {
      const { userId: uSpUserId, userName: uSpUserName } = getCallerIdentity(req);
      logAction(uSpUserId, uSpUserName, 'Update', 'SparePart', id, detailsMsg);
    }
    res.json({ message: 'Spare part updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/spare-parts/:id', (req, res) => {
  try {
    const { isAdmin } = getCallerIdentity(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
    const { id } = req.params;
    const oldPart = db.prepare('SELECT * FROM spare_parts WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM spare_parts WHERE id = ?').run(id);
    const entityName = oldPart ? oldPart.name : id;
    const { userId: dSpUserId, userName: dSpUserName } = getCallerIdentity(req);
    logAction(dSpUserId, dSpUserName, 'Delete', 'SparePart', id, `Deleted Spare Part "${entityName}"`);
    res.json({ message: 'Spare part deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Users
app.get('/api/users', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM users').all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/users/:uid', (req, res) => {
  try {
    const { uid } = req.params;
    const user = { ...req.body };
    user.updatedAt = new Date().toISOString();

    const oldUser = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as any;

    const sets = Object.keys(user).map(key => `${key} = ?`).join(', ');
    const values = Object.values(user);

    db.prepare(`UPDATE users SET ${sets} WHERE uid = ?`).run(...values, uid);
    const entityName = oldUser ? (oldUser.displayName || oldUser.username) : uid;
    const detailsMsg = getChangesString('User', entityName, oldUser, user);
    if (detailsMsg) {
      const { userId: uUUserId, userName: uUUserName } = getCallerIdentity(req);
      logAction(uUUserId, uUUserName, 'Update', 'User', uid, detailsMsg);
    }
    res.json({ message: 'User updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/users/:uid', (req, res) => {
  try {
    const { isAdmin } = getCallerIdentity(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
    const { uid } = req.params;
    const oldUser = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as any;
    db.prepare('DELETE FROM users WHERE uid = ?').run(uid);
    const entityName = oldUser ? (oldUser.displayName || oldUser.username) : uid;
    const { userId: dUUserId, userName: dUUserName } = getCallerIdentity(req);
    logAction(dUUserId, dUUserName, 'Delete', 'User', uid, `Deleted User "${entityName}"`);
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- Audit Logs ---
app.get('/api/audit-logs', (req, res) => {
  try {
    const { date, username } = req.query;
    let query = 'SELECT * FROM audit_logs';
    let params: any[] = [];
    let conditions: string[] = [];

    if (date) {
      conditions.push('DATE(createdAt) = ?');
      params.push(date);
    }
    if (username) {
      conditions.push('username LIKE ?');
      params.push(`%${username}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
      // Limit to 500 for performance when searching
      query += ' ORDER BY createdAt DESC LIMIT 500';
    } else {
      query += ' ORDER BY createdAt DESC LIMIT 100';
    }

    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error) {
    console.error('Audit log fetch error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Allowed action types for explicit logging
const ALLOWED_ACTIONS = ['SCAN_QR', 'ACCESS_MACHINE', 'ASSIGN_MACHINE', 'CHANGE_STATUS', 'START_MACHINE', 'STOP_MACHINE', 'UPDATE_STOCK'];

app.post('/api/audit-logs', (req, res) => {
  try {
    const { action, entityType, entityId, details } = req.body;

    if (!action || !entityType || !entityId || !details) {
      return res.status(400).json({ error: 'Missing required fields: action, entityType, entityId, details' });
    }
    if (!ALLOWED_ACTIONS.includes(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${ALLOWED_ACTIONS.join(', ')}` });
    }

    let userId: string | undefined;
    let userName = 'Unknown';
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded?.uid) {
          userId = decoded.uid;
          userName = decoded.displayName || decoded.username || 'User';
        }
      } catch (e) {
        // Ignore token errors — log with unknown user
      }
    }

    logAction(userId, userName, action, entityType, entityId, details);
    res.status(201).json({ message: 'Audit log created' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- Analytics ---
app.get('/api/analytics/downtime-trends', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DATE(completedAt) as date, SUM(durationMinutes) as downtimeMinutes 
      FROM intervention_reports 
      WHERE maintenanceType = 'corrective' 
      GROUP BY DATE(completedAt) 
      ORDER BY date DESC 
      LIMIT 30
    `).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/analytics/part-consumption', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT sp.name as partName, SUM(ip.quantity) as quantity 
      FROM intervention_parts ip 
      JOIN spare_parts sp ON ip.partId = sp.id 
      GROUP BY sp.name 
      ORDER BY quantity DESC 
      LIMIT 10
    `).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/analytics/technician-performance', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT technicians as technicianNames, durationMinutes 
      FROM intervention_reports 
      WHERE technicians IS NOT NULL AND technicians != ''
    `).all();

    const performanceMap: Record<string, { technicianName: string, completedOrders: number, totalDuration: number }> = {};

    rows.forEach((row: any) => {
      const names = row.technicianNames.split(',').map((n: string) => n.trim()).filter((n: string) => n.length > 0);
      names.forEach((name: string) => {
        if (!performanceMap[name]) {
          performanceMap[name] = { technicianName: name, completedOrders: 0, totalDuration: 0 };
        }
        performanceMap[name].completedOrders += 1;
        performanceMap[name].totalDuration += (row.durationMinutes || 0);
      });
    });

    const result = Object.values(performanceMap).map(p => ({
      technicianName: p.technicianName,
      completedOrders: p.completedOrders,
      avgDurationMinutes: Math.round(p.totalDuration / p.completedOrders)
    })).sort((a, b) => b.completedOrders - a.completedOrders);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/analytics/mttr-trends', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DATE(completedAt) as date, AVG(durationMinutes) as mttrMinutes 
      FROM intervention_reports 
      WHERE maintenanceType = 'corrective' 
      GROUP BY DATE(completedAt) 
      ORDER BY date ASC 
      LIMIT 30
    `).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/analytics/mtbf-trends', (req, res) => {
  try {
    const failuresPerDay = db.prepare(`
      SELECT DATE(completedAt) as date, COUNT(*) as failureCount
      FROM intervention_reports
      WHERE maintenanceType = 'corrective'
      GROUP BY DATE(completedAt)
      ORDER BY date ASC
      LIMIT 30
    `).all();

    const machineCount = db.prepare('SELECT COUNT(*) as count FROM machines').get().count || 1;
    const dailyOperatingMinutesPerMachine = 8 * 60;
    const totalDailyOperatingMinutes = machineCount * dailyOperatingMinutesPerMachine;

    const rows = failuresPerDay.map((f: any) => ({
      date: f.date,
      mtbfHours: f.failureCount > 0 ? Number((totalDailyOperatingMinutes / f.failureCount / 60).toFixed(1)) : Number((totalDailyOperatingMinutes / 60).toFixed(1))
    }));

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- File Uploads ---
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// --- Machine Rendement ---
app.get('/api/machine-rendement', (req, res) => {
  try {
    const { date } = req.query;
    let query = 'SELECT * FROM machine_rendement';
    const params: any[] = [];
    if (date) {
      query += ' WHERE date = ?';
      params.push(date);
    }
    query += ' ORDER BY date DESC, id DESC';
    const rows = db.prepare(query).all(...params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/machine-rendement', (req, res) => {
  try {
    const { date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime, actualCavitiesRunning, trs, comment, priceMarket } = req.body;
    const info = db.prepare(`
      INSERT INTO machine_rendement (date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime, actualCavitiesRunning, trs, comment, priceMarket)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime || 0, actualCavitiesRunning || 0, trs || 0, comment || '', priceMarket || 'TN');
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/machine-rendement/:id', (req, res) => {
  try {
    const { role } = getCallerIdentity(req);
    if (role !== 'admin' && role !== 'manager') {
      return res.status(403).json({ error: 'Forbidden: Manager or Admin role required' });
    }
    const { id } = req.params;
    const { date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime, actualCavitiesRunning, trs, comment, priceMarket } = req.body;
    db.prepare(`
      UPDATE machine_rendement SET date=?, machineNumber=?, item=?, targetQty=?, qtyShift1=?, qtyShift2=?, qtyShift3=?,
        efficiencyShift1=?, efficiencyShift2=?, efficiencyShift3=?, actualCycleTime=?, actualCavitiesRunning=?, trs=?, comment=?, priceMarket=? WHERE id=?
    `).run(date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime || 0, actualCavitiesRunning || 0, trs || 0, comment || '', priceMarket || 'TN', id);
    res.json({ message: 'Record updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/machine-rendement/:id', (req, res) => {
  try {
    const { isAdmin } = getCallerIdentity(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
    const { id } = req.params;
    db.prepare('DELETE FROM machine_rendement WHERE id = ?').run(id);
    res.json({ message: 'Record deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ─── BACKUP SYSTEM ────────────────────────────────────────────────────────────────
const BACKUPS_DIR = path.join(__dirname, 'backups');
const MAX_BACKUPS = 30; // keep last 30 daily backups

function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

function getBackupFilename(suffix = '') {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
  return suffix
    ? `backup-${date}_${time}-${suffix}.db`
    : `backup-${date}.db`;
}

async function createBackup(filename?: string): Promise<string> {
  ensureBackupsDir();
  const name = filename || getBackupFilename();
  const dest = path.join(BACKUPS_DIR, name);
  // Use better-sqlite3 online backup — safe even while DB is being written to
  await (db as any).backup(dest);
  console.log(`✅ [Backup] Created: ${name}`);
  return name;
}

function pruneOldBackups() {
  ensureBackupsDir();
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.db') && !f.includes('-safety-'))
    .sort(); // ascending — oldest first
  if (files.length > MAX_BACKUPS) {
    const toDelete = files.slice(0, files.length - MAX_BACKUPS);
    toDelete.forEach(f => {
      fs.unlinkSync(path.join(BACKUPS_DIR, f));
      console.log(`🗑️  [Backup] Pruned old backup: ${f}`);
    });
  }
}

function scheduleAutoBackup() {
  const now = new Date();
  // Next midnight
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  console.log(`⏰ [Backup] Next auto-backup scheduled in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`);

  setTimeout(async () => {
    await createBackup();
    pruneOldBackups();
    // Then repeat every 24h
    setInterval(async () => {
      await createBackup();
      pruneOldBackups();
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

// GET /api/backups — list all saved backups
app.get('/api/backups', (_req, res) => {
  try {
    ensureBackupsDir();
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUPS_DIR, f));
        return {
          filename: f,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // newest first
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/backups/create — manually trigger a backup now
app.post('/api/backups/create', async (_req, res) => {
  try {
    const name = await createBackup(getBackupFilename('manual'));
    pruneOldBackups();
    res.json({ message: 'Backup created', filename: name });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/backups/download — download a fresh live snapshot of the DB
app.get('/api/backups/download', async (_req, res) => {
  try {
    const tmpName = getBackupFilename('snapshot');
    const tmpPath = path.join(BACKUPS_DIR, tmpName);
    ensureBackupsDir();
    await (db as any).backup(tmpPath);
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Disposition', `attachment; filename="gmao-backup-${date}.db"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    const stream = fs.createReadStream(tmpPath);
    stream.pipe(res);
    stream.on('close', () => {
      try { fs.unlinkSync(tmpPath); } catch (_) { }
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/backups/download/:filename — download a specific saved backup
app.get('/api/backups/download/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename); // sanitize
    const filePath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/backups/restore/:filename — restore from a saved backup
app.post('/api/backups/restore/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const srcPath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(srcPath)) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    // 1. Safety backup of current state
    const safetyName = getBackupFilename('safety-before-restore');
    await (db as any).backup(path.join(BACKUPS_DIR, safetyName));
    // 2. Close current connection, swap the file, delete stale WAL
    (db as any).close();
    fs.copyFileSync(srcPath, DB_PATH);
    try { fs.unlinkSync(DB_PATH + '-wal'); } catch (_) { }
    try { fs.unlinkSync(DB_PATH + '-shm'); } catch (_) { }
    // 3. Hot-reload the DB connection — no process restart needed
    reloadDb();
    console.log(`✅ [Backup] Restored from ${filename}.`);
    res.json({ message: `Restauration depuis "${filename}" effectuée avec succès.`, safety: safetyName });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/backups/restore-upload — restore from an uploaded .db file
const backupUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { ensureBackupsDir(); cb(null, BACKUPS_DIR); },
    filename: (_req, _file, cb) => { cb(null, getBackupFilename('uploaded')); },
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, file.originalname.endsWith('.db'));
  },
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max
});

app.post('/api/backups/restore-upload', backupUpload.single('dbfile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded or invalid file type (.db required)' });
    const uploadedPath = req.file.path;
    // Safety backup first
    const safetyName = getBackupFilename('safety-before-upload-restore');
    await (db as any).backup(path.join(BACKUPS_DIR, safetyName));
    // Close, swap, clean WAL, hot-reload
    (db as any).close();
    fs.copyFileSync(uploadedPath, DB_PATH);
    try { fs.unlinkSync(DB_PATH + '-wal'); } catch (_) { }
    try { fs.unlinkSync(DB_PATH + '-shm'); } catch (_) { }
    reloadDb();
    console.log(`✅ [Backup] Restored from uploaded file.`);
    res.json({ message: 'Restauration depuis le fichier uploadé effectuée avec succès.', safety: safetyName });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- Calendar Events ---
app.get('/api/calendar-events', (req, res) => {
  try {
    const { month } = req.query;
    let rows;
    if (month && typeof month === 'string') {
      rows = db.prepare('SELECT * FROM calendar_events WHERE startDate LIKE ? OR endDate LIKE ?').all(`${month}%`, `${month}%`);
    } else {
      rows = db.prepare('SELECT * FROM calendar_events').all();
    }
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/calendar-events', (req, res) => {
  try {
    const event = { ...req.body };
    if (!event.id) {
      event.id = 'evt_' + Math.random().toString(36).substring(2, 15);
    }
    event.createdAt = new Date().toISOString();
    event.updatedAt = new Date().toISOString();

    const columns = Object.keys(event).join(', ');
    const placeholders = Object.keys(event).map(() => '?').join(', ');
    const values = Object.values(event);

    db.prepare(`INSERT INTO calendar_events (${columns}) VALUES (${placeholders})`).run(...values);

    let userId: string | undefined;
    let userName = 'System';
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded?.uid) {
          userId = decoded.uid;
          userName = decoded.displayName || decoded.username || 'User';
        }
      } catch (e) { }
    }
    logAction(userId, userName, 'Create', 'CalendarEvent', event.id, `Created Calendar Event "${event.title}"`);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/calendar-events/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body };
    delete updates.id;
    updates.updatedAt = new Date().toISOString();

    const oldEvent = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as any;
    if (!oldEvent) {
      return res.status(404).json({ error: 'Calendar event not found' });
    }

    const sets = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);

    db.prepare(`UPDATE calendar_events SET ${sets} WHERE id = ?`).run(...values, id);

    let userId: string | undefined;
    let userName = 'System';
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded?.uid) {
          userId = decoded.uid;
          userName = decoded.displayName || decoded.username || 'User';
        }
      } catch (e) { }
    }
    logAction(userId, userName, 'Update', 'CalendarEvent', id, `Updated Calendar Event "${updates.title || oldEvent.title}"`);
    res.json({ message: 'Calendar event updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/calendar-events/:id', (req, res) => {
  try {
    const { id } = req.params;
    const oldEvent = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);

    let userId: string | undefined;
    let userName = 'System';
    const token = req.cookies?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded?.uid) {
          userId = decoded.uid;
          userName = decoded.displayName || decoded.username || 'User';
        }
      } catch (e) { }
    }
    const entityName = oldEvent ? oldEvent.title : id;
    logAction(userId, userName, 'Delete', 'CalendarEvent', id, `Deleted Calendar Event "${entityName}"`);
    res.json({ message: 'Calendar event deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ─── Vite Integration ──────────────────────────────────────────────────────────────

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n Server is running!`);
    console.log(`Local: http://localhost:${PORT}`);

    // Get network interfaces to show the IP address for VPN/Local Network sharing
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach((ifname) => {
      interfaces[ifname]?.forEach((iface) => {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`Network (${ifname}): http://${iface.address}:${PORT}`);
        }
      });
    });
    console.log(`\nPress Ctrl+C to stop the server\n`);
  });

  // Start the auto-backup scheduler after server is up
  scheduleAutoBackup();
}

startServer();
