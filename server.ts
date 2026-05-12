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
import db from './db.js';
import os from 'os';


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

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
  const { reference, date, requested_by, department, supplier, items_count, pdf_data } = req.body;
  try {
    const info = db.prepare(`
      INSERT INTO purchase_requests (reference, date, requested_by, department, supplier, items_count, pdf_data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(reference, date, requested_by, department, supplier, items_count, pdf_data);
    res.json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
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
    const machine = { ...req.body };
    if (machine.preventivePlan) {
      machine.preventivePlan = JSON.stringify(machine.preventivePlan);
    }
    const columns = Object.keys(machine).join(', ');
    const placeholders = Object.keys(machine).map(() => '?').join(', ');
    const values = Object.values(machine);

    db.prepare(`INSERT INTO machines (${columns}) VALUES (${placeholders})`).run(...values);

    logAction(undefined, 'System', 'Create', 'Machine', machine.id, `Created Machine "${machine.name || machine.serialNumber}"`);

    // Log initial condition
    if (machine.condition) {
      db.prepare(`
        INSERT INTO machine_condition_history (machineId, previousCondition, newCondition)
        VALUES (?, ?, ?)
      `).run(machine.id, null, machine.condition);
    }

    res.status(201).json({ message: 'Machine created' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/machines/:id', (req, res) => {
  try {
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

app.delete('/api/machines/:id', (req, res) => {
  try {
    const { id } = req.params;
    const oldMachine = db.prepare('SELECT * FROM machines WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM machines WHERE id = ?').run(id);
    const entityName = oldMachine ? (oldMachine.name || oldMachine.serialNumber) : id;
    logAction(undefined, 'System', 'Delete', 'Machine', id, `Deleted Machine "${entityName}"`);
    res.json({ message: 'Machine deleted' });
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
    logAction(undefined, 'System', 'Create', 'WorkOrder', workOrder.id, `Created Work Order "${workOrder.title}"`);
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
      logAction(undefined, 'System', 'Update', 'WorkOrder', id, detailsMsg);
    }
    res.json({ message: 'Work order updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/work-orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const oldWorkOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM work_orders WHERE id = ?').run(id);
    const entityName = oldWorkOrder ? oldWorkOrder.title : id;
    logAction(undefined, 'System', 'Delete', 'WorkOrder', id, `Deleted Work Order "${entityName}"`);
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
    const { id } = req.params;
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/spare-parts', (req, res) => {
  try {
    const part = req.body;
    const columns = Object.keys(part).join(', ');
    const placeholders = Object.keys(part).map(() => '?').join(', ');
    const values = Object.values(part);

    db.prepare(`INSERT INTO spare_parts (${columns}) VALUES (${placeholders})`).run(...values);
    logAction(undefined, 'System', 'Create', 'SparePart', part.id, `Created Spare Part "${part.name}"`);
    res.status(201).json({ message: 'Spare part created' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/spare-parts/:id', (req, res) => {
  try {
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
      logAction(undefined, 'System', 'Update', 'SparePart', id, detailsMsg);
    }
    res.json({ message: 'Spare part updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/spare-parts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const oldPart = db.prepare('SELECT * FROM spare_parts WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM spare_parts WHERE id = ?').run(id);
    const entityName = oldPart ? oldPart.name : id;
    logAction(undefined, 'System', 'Delete', 'SparePart', id, `Deleted Spare Part "${entityName}"`);
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
      logAction(undefined, 'System', 'Update', 'User', uid, detailsMsg);
    }
    res.json({ message: 'User updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/users/:uid', (req, res) => {
  try {
    const { uid } = req.params;
    const oldUser = db.prepare('SELECT * FROM users WHERE uid = ?').get(uid) as any;
    db.prepare('DELETE FROM users WHERE uid = ?').run(uid);
    const entityName = oldUser ? (oldUser.displayName || oldUser.username) : uid;
    logAction(undefined, 'System', 'Delete', 'User', uid, `Deleted User "${entityName}"`);
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
const ALLOWED_ACTIONS = ['SCAN_QR', 'ACCESS_MACHINE', 'ASSIGN_MACHINE', 'CHANGE_STATUS', 'START_MACHINE', 'STOP_MACHINE'];

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
    const { date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime, actualCavitiesRunning, trs, comment } = req.body;
    const info = db.prepare(`
      INSERT INTO machine_rendement (date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime, actualCavitiesRunning, trs, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime || 0, actualCavitiesRunning || 0, trs || 0, comment || '');
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/machine-rendement/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime, actualCavitiesRunning, trs, comment } = req.body;
    db.prepare(`
      UPDATE machine_rendement SET date=?, machineNumber=?, item=?, targetQty=?, qtyShift1=?, qtyShift2=?, qtyShift3=?,
        efficiencyShift1=?, efficiencyShift2=?, efficiencyShift3=?, actualCycleTime=?, actualCavitiesRunning=?, trs=?, comment=? WHERE id=?
    `).run(date, machineNumber, item, targetQty, qtyShift1, qtyShift2, qtyShift3, efficiencyShift1, efficiencyShift2, efficiencyShift3, actualCycleTime || 0, actualCavitiesRunning || 0, trs || 0, comment || '', id);
    res.json({ message: 'Record updated' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/machine-rendement/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM machine_rendement WHERE id = ?').run(id);
    res.json({ message: 'Record deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- Vite Integration ---

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
}

startServer();
