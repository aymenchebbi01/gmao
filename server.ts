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
import {
  initWhatsApp,
  getWhatsAppStatus,
  sendMachineDownAlert,
  sendWorkOrderCreatedAlert
} from './whatsappService.js';


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

  // ── Technical specification columns (all optional) ────────────────────────
  const specColumns: { name: string; type: string }[] = [
    { name: 'closingType',              type: 'TEXT' },
    { name: 'moldThicknessMin',         type: 'REAL' },
    { name: 'moldThicknessMax',         type: 'REAL' },
    { name: 'centeringDiameter',        type: 'REAL' },
    { name: 'tieBarSpacingHorizontal',  type: 'REAL' },
    { name: 'tieBarSpacingVertical',    type: 'REAL' },
    { name: 'maxOpeningStroke',         type: 'REAL' },
    { name: 'maxEjectionStroke',        type: 'REAL' },
    { name: 'coreCount',                type: 'INTEGER' },
    { name: 'screwDiameter',            type: 'REAL' },
    { name: 'maxInjectableVolume',      type: 'REAL' },
    { name: 'coolingChannelCount',      type: 'INTEGER' },
    { name: 'thermalRegulation',        type: 'TEXT' },
    { name: 'accessories',              type: 'TEXT' },
    { name: 'hydraulicOilType',         type: 'TEXT' },
    { name: 'lubricantType',            type: 'TEXT' },
    { name: 'reservoirCapacity',        type: 'REAL' },
  ];
  for (const col of specColumns) {
    const exists = tableInfo.some((c: any) => c.name === col.name);
    if (!exists) {
      db.prepare(`ALTER TABLE machines ADD COLUMN ${col.name} ${col.type}`).run();
      console.log(`Added ${col.name} column to machines table`);
    }
  }

  // New table for production history (tracking product/mold changes)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS machine_production_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machineId TEXT NOT NULL,
      productName TEXT,
      mouleName TEXT,
      startDate DATETIME DEFAULT CURRENT_TIMESTAMP,
      endDate DATETIME,
      qtyProduced INTEGER,
      qtyGood INTEGER,
      qtyBad INTEGER
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

  // New bon_livraison table for stock delivery notes
  db.prepare(`
    CREATE TABLE IF NOT EXISTS bon_livraison (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      requested_by TEXT,
      department TEXT,
      machine_id TEXT,
      machine_name TEXT,
      reason TEXT,
      notes TEXT,
      items_json TEXT,
      items_count INTEGER DEFAULT 0,
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

// ── Bon de Livraison Endpoints ───────────────────────────────────────────────
app.get('/api/bon-livraison', (req, res) => {
  try {
    const records = db.prepare('SELECT * FROM bon_livraison ORDER BY id DESC').all();
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/bon-livraison/last-ref', (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `BL${currentYear}`;
    const row = db.prepare(`
      SELECT reference FROM bon_livraison
      WHERE reference LIKE ?
      ORDER BY reference DESC
      LIMIT 1
    `).get(`${prefix}%`) as { reference: string } | undefined;

    let nextRef = `${prefix}0001`;
    if (row && row.reference) {
      const numPart = parseInt(row.reference.replace(prefix, ''), 10);
      if (!isNaN(numPart)) {
        const nextNum = (numPart + 1).toString().padStart(4, '0');
        nextRef = `${prefix}${nextNum}`;
      }
    }
    res.json({ lastRef: row ? row.reference : null, nextRef });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post('/api/bon-livraison', (req, res) => {
  let { reference, date, requested_by, department, machine_id, machine_name, reason, notes, items_json, items_count } = req.body;
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `BL${currentYear}`;

    if (!reference || reference.startsWith('BL-') || reference === '') {
      const row = db.prepare(`
        SELECT reference FROM bon_livraison
        WHERE reference LIKE ?
        ORDER BY reference DESC
        LIMIT 1
      `).get(`${prefix}%`) as { reference: string } | undefined;

      let nextNum = 1;
      if (row && row.reference) {
        const numPart = parseInt(row.reference.replace(prefix, ''), 10);
        if (!isNaN(numPart)) {
          nextNum = numPart + 1;
        }
      }
      reference = `${prefix}${nextNum.toString().padStart(4, '0')}`;
    }

    const count = items_count !== undefined ? items_count : (items_json ? JSON.parse(items_json).length : 0);

    const info = db.prepare(`
      INSERT INTO bon_livraison (reference, date, requested_by, department, machine_id, machine_name, reason, notes, items_json, items_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(reference, date, requested_by, department, machine_id || null, machine_name || null, reason, notes, items_json, count);

    res.json({ id: info.lastInsertRowid, reference });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.delete('/api/bon-livraison/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM bon_livraison WHERE id = ?').run(id);
    res.json({ message: 'Bon de livraison deleted' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get('/api/server-ip', (_req, res) => {
  if (process.env.SERVER_IP) {
    return res.json({ ip: process.env.SERVER_IP, port: PORT });
  }

  const interfaces = os.networkInterfaces();
  const candidates: { name: string; address: string; priority: number }[] = [];

  const ignorePatterns = [
    /vmware/i, /vmnet/i, /virtualbox/i, /vbox/i, /vethernet/i, /hyper-v/i,
    /loopback/i, /pseudo/i, /docker/i, /wsl/i, /npcap/i, /pcap/i,
    /bluetooth/i, /tunnel/i, /tap/i, /tun/i, /wireguard/i, /tailscale/i,
    /zerotier/i, /vpn/i, /host-only/i
  ];

  for (const [name, netList] of Object.entries(interfaces)) {
    if (!netList) continue;
    const isIgnored = ignorePatterns.some(p => p.test(name));
    if (isIgnored) continue;

    for (const net of netList) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('127.') || net.address.startsWith('169.254.') || net.address === '0.0.0.0') {
          continue;
        }

        let priority = 1;
        if (/wi-fi|wifi|wlan|wireless/i.test(name)) priority += 20;
        if (/ethernet|eth|lan|local area/i.test(name)) priority += 15;
        if (net.address.startsWith('192.168.')) priority += 5;
        else if (net.address.startsWith('10.')) priority += 4;
        else if (net.address.startsWith('172.')) priority += 2;

        candidates.push({ name, address: net.address, priority });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const bestIp = candidates.length > 0 ? candidates[0].address : 'localhost';
  res.json({ ip: bestIp, port: PORT });
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
    // Allow admin, manager, technician, production, and mobile QR updates
    if (role !== 'admin' && role !== 'manager' && role !== 'technician' && role !== 'production') {
      const isMobileUpdater = req.body.status !== undefined || req.body.injectingProduct !== undefined || req.body.currentMoule !== undefined || req.body.currentHours !== undefined || req.body.lastMaintenance !== undefined || req.body.condition !== undefined;
      if (!isMobileUpdater) {
        return res.status(403).json({ error: 'Forbidden: Valid role required' });
      }
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

    // Extract production quantities before updating machines table
    const qtyProduced = machine.qtyProduced !== undefined ? (machine.qtyProduced === '' || machine.qtyProduced === null ? null : Number(machine.qtyProduced)) : undefined;
    const qtyGood = machine.qtyGood !== undefined ? (machine.qtyGood === '' || machine.qtyGood === null ? null : Number(machine.qtyGood)) : undefined;
    const qtyBad = machine.qtyBad !== undefined ? (machine.qtyBad === '' || machine.qtyBad === null ? null : Number(machine.qtyBad)) : undefined;
    delete machine.qtyProduced;
    delete machine.qtyGood;
    delete machine.qtyBad;
    delete machine.prevQtyProduced;
    delete machine.prevQtyGood;
    delete machine.prevQtyBad;

    // Log production change (Product or Mold) and/or update quantities
    if (machine.injectingProduct !== undefined || machine.currentMoule !== undefined || qtyProduced !== undefined || qtyGood !== undefined || qtyBad !== undefined) {
      const newProduct = machine.injectingProduct !== undefined ? machine.injectingProduct : (oldMachine ? oldMachine.injectingProduct : undefined);
      const newMoule = machine.currentMoule !== undefined ? machine.currentMoule : (oldMachine ? oldMachine.currentMoule : undefined);

      if (oldMachine && (oldMachine.injectingProduct !== newProduct || oldMachine.currentMoule !== newMoule)) {
        // End the previous history entry and record final quantities produced
        db.prepare(`
          UPDATE machine_production_history
          SET endDate = ?,
              qtyProduced = COALESCE(?, qtyProduced),
              qtyGood = COALESCE(?, qtyGood),
              qtyBad = COALESCE(?, qtyBad)
          WHERE machineId = ? AND endDate IS NULL
        `).run(new Date().toISOString(), qtyProduced ?? null, qtyGood ?? null, qtyBad ?? null, id);

        // Start a new history entry
        db.prepare(`
          INSERT INTO machine_production_history (machineId, productName, mouleName, startDate)
          VALUES (?, ?, ?, ?)
        `).run(id, newProduct || '', newMoule || '', new Date().toISOString());
      } else if (qtyProduced !== undefined || qtyGood !== undefined || qtyBad !== undefined) {
        // Update current active production record's quantities
        db.prepare(`
          UPDATE machine_production_history
          SET qtyProduced = ?,
              qtyGood = ?,
              qtyBad = ?
          WHERE machineId = ? AND endDate IS NULL
        `).run(qtyProduced ?? null, qtyGood ?? null, qtyBad ?? null, id);
      }
    }

    // Log status / downtime start
    if (machine.status !== undefined) {
      if (machine.status === 'down' || machine.status === 'maintenance') {
        if (!machine.downStartTime) {
          if (!oldMachine || (oldMachine.status !== 'down' && oldMachine.status !== 'maintenance') || !oldMachine.downStartTime) {
            machine.downStartTime = new Date().toISOString();
          }
        }
      } else if (machine.status === 'operational' || machine.status === 'idle' || machine.status === 'retired') {
        if (machine.downStartTime === undefined) {
          machine.downStartTime = null;
        }
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

    // WhatsApp Machine Breakdown Alert
    if (machine.status === 'down' || machine.status === 'maintenance') {
      if (!oldMachine || oldMachine.status !== machine.status || machine.statusReason) {
        sendMachineDownAlert({
          machineName: oldMachine?.name || machine.name || id,
          serialNumber: oldMachine?.serialNumber || machine.serialNumber,
          location: oldMachine?.location || machine.location,
          siteNumber: oldMachine?.siteNumber || machine.siteNumber,
          reason: machine.statusReason || oldMachine?.statusReason,
          reportedBy: userName,
          status: machine.status
        }).catch(err => console.error("WhatsApp machine down alert error:", err));
      }
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

// Global production history (all machines) - for the Production & Mold History page
app.get('/api/production-history', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        mph.id, mph.machineId, mph.productName, mph.mouleName,
        mph.startDate, mph.endDate, mph.qtyProduced, mph.qtyGood, mph.qtyBad,
        m.name AS machineName,
        m.siteNumber,
        m.location,
        m.status AS machineStatus
      FROM machine_production_history mph
      LEFT JOIN machines m ON m.id = mph.machineId
      ORDER BY mph.startDate DESC
    `).all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.put('/api/machine-production-history/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { productName, mouleName, startDate, endDate, qtyProduced, qtyGood, qtyBad } = req.body;

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

    const parseNumOrNull = (val: any) => {
      if (val === undefined || val === null || val === '') return null;
      const parsed = Number(val);
      return isNaN(parsed) ? null : parsed;
    };

    const cleanQtyProduced = parseNumOrNull(qtyProduced);
    const cleanQtyGood = parseNumOrNull(qtyGood);
    const cleanQtyBad = parseNumOrNull(qtyBad);

    db.prepare(`
      UPDATE machine_production_history
      SET productName = ?, mouleName = ?, startDate = ?, endDate = ?, qtyProduced = ?, qtyGood = ?, qtyBad = ?
      WHERE id = ?
    `).run(productName, mouleName, startDate, endDate, cleanQtyProduced, cleanQtyGood, cleanQtyBad, id);

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

    // WhatsApp Work Order Alert
    sendWorkOrderCreatedAlert({
      workOrderId: workOrder.id,
      title: workOrder.title,
      machineName: workOrder.machineName,
      priority: workOrder.priority,
      type: workOrder.type,
      requesterName: workOrder.requesterName || workOrder.createdByName || cWoUserName,
      description: workOrder.description || workOrder.malfunctionDescription,
      location: workOrder.location
    }).catch(err => console.error("WhatsApp work order alert error:", err));

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

// Delete only the intervention report, keeping the work order intact
app.delete('/api/work-orders/:id/intervention', (req, res) => {
  try {
    const { isAdmin } = getCallerIdentity(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin role required' });
    }
    const { id } = req.params;
    const oldWorkOrder = db.prepare('SELECT * FROM work_orders WHERE id = ?').get(id) as any;
    if (!oldWorkOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    // 1. Delete associated intervention records
    db.prepare('DELETE FROM intervention_parts WHERE workOrderId = ?').run(id);
    db.prepare('DELETE FROM intervention_reports WHERE workOrderId = ?').run(id);

    // 2. Clear intervention on work_orders and revert status to pending if completed
    const newStatus = oldWorkOrder.status === 'completed' ? 'pending' : oldWorkOrder.status;
    db.prepare(`
      UPDATE work_orders 
      SET intervention = NULL, completedAt = NULL, status = ?, updatedAt = ?
      WHERE id = ?
    `).run(newStatus, new Date().toISOString(), id);

    const { userId: dUserId, userName: dUserName } = getCallerIdentity(req);
    logAction(dUserId, dUserName, 'Delete', 'InterventionReport', id, `Deleted Intervention Report for Work Order "${oldWorkOrder.title || id}" (Work order preserved as ${newStatus})`);

    res.json({ message: 'Intervention report deleted successfully. Work order retained.' });
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

// DELETE /api/backups/:filename — delete a specific saved backup
app.delete('/api/backups/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup not found' });
    }
    fs.unlinkSync(filePath);
    console.log(`🗑️ [Backup] Deleted ${filename}.`);
    res.json({ message: `Sauvegarde "${filename}" supprimée avec succès.` });
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

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTION MODULE API (migrated from production101)
// ═══════════════════════════════════════════════════════════════════════════════

// ── PRODUCTION LINES (renamed from "machines" in production101) ──────────────
app.get('/api/production/lines', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM production_lines ORDER BY name ASC').all();
    res.json(rows);
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/lines', (req, res) => {
  try {
    const { id, name, cadence, category } = req.body;
    db.prepare(
      'INSERT INTO production_lines (id, name, cadence, category) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET cadence=excluded.cadence, category=excluded.category'
    ).run(id, name, cadence, category || null);
    res.status(201).json({ message: 'Production line added or updated' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.put('/api/production/lines/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, cadence, category } = req.body;
    db.prepare('UPDATE production_lines SET name = ?, cadence = ?, category = ? WHERE id = ?').run(name, cadence, category || null, id);
    res.json({ message: 'Production line updated' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/lines/all', (req, res) => {
  try {
    db.prepare('DELETE FROM production_lines').run();
    res.json({ message: 'All production lines deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/lines/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM production_lines WHERE id = ?').run(req.params.id);
    res.json({ message: 'Production line deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

// ── PRODUCTION WORKERS ────────────────────────────────────────────────────────
app.get('/api/production/workers', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM production_workers ORDER BY worker_id ASC').all();
    res.json(rows);
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/workers/batch', (req, res) => {
  try {
    const { workers } = req.body as { workers: any[] };
    if (!workers || workers.length === 0) return res.status(400).json({ error: 'No workers provided' });
    const insert = db.prepare(
      'INSERT INTO production_workers (id, worker_id, name) VALUES (?, ?, ?) ON CONFLICT(worker_id) DO UPDATE SET name=excluded.name'
    );
    const insertMany = db.transaction((rows: any[]) => {
      for (const w of rows) {
        insert.run(w.id || (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)), String(w.worker_id).trim(), String(w.name).trim());
      }
    });
    insertMany(workers);
    res.status(201).json({ inserted: workers.length });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/workers', (req, res) => {
  try {
    const { id, worker_id, name } = req.body;
    db.prepare(
      'INSERT INTO production_workers (id, worker_id, name) VALUES (?, ?, ?) ON CONFLICT(worker_id) DO UPDATE SET name=excluded.name'
    ).run(id, worker_id, name);
    res.status(201).json({ message: 'Worker added or updated' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.put('/api/production/workers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { worker_id, name } = req.body;
    db.prepare('UPDATE production_workers SET worker_id = ?, name = ? WHERE id = ?').run(worker_id, name, id);
    res.json({ message: 'Worker updated' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/workers/all', (req, res) => {
  try {
    db.prepare('DELETE FROM production_workers').run();
    res.json({ message: 'All workers deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/workers/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM production_workers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Worker deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

// ── PRODUCTION RECORDS ────────────────────────────────────────────────────────
app.get('/api/production/records', (req, res) => {
  try {
    const { dateStart, dateEnd, workerId, workerName, setNumber, itemNumber, machineCategory } = req.query as Record<string, string>;
    let sql = 'SELECT r.*, l.category as machine_category FROM production_records r LEFT JOIN production_lines l ON r.machine_name = l.name WHERE 1=1';
    const params: any[] = [];
    if (dateStart) { sql += ' AND r.date >= ?'; params.push(dateStart); }
    if (dateEnd) { sql += ' AND r.date <= ?'; params.push(dateEnd); }
    sql += ' ORDER BY r.date DESC';
    let rows = db.prepare(sql).all(...params) as any[];
    if (workerId) rows = rows.filter((r: any) => r.worker_id.toLowerCase().includes(workerId.toLowerCase()));
    if (workerName) rows = rows.filter((r: any) => (r.worker_name || '').toLowerCase().includes(workerName.toLowerCase()));
    if (setNumber) rows = rows.filter((r: any) => r.set_number.toLowerCase().includes(setNumber.toLowerCase()));
    if (itemNumber) rows = rows.filter((r: any) => r.item_number.toLowerCase().includes(itemNumber.toLowerCase()));
    if (machineCategory) rows = rows.filter((r: any) => (r.machine_category || '').toLowerCase() === machineCategory.toLowerCase());
    res.json(rows);
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/records/batch', (req, res) => {
  try {
    const { records } = req.body as { records: any[] };
    if (!records || records.length === 0) return res.status(400).json({ error: 'No records provided' });
    const insert = db.prepare(
      'INSERT OR REPLACE INTO production_records (id, date, worker_id, worker_name, set_number, item_number, quantity, upload_id, created_at, machine_name, hours_worked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertMany = db.transaction((rows: any[]) => {
      for (const r of rows) {
        insert.run(r.id, r.date, r.worker_id, r.worker_name, r.set_number, r.item_number, r.quantity, r.upload_id, r.created_at, r.machine_name || null, r.hours_worked || null);
      }
    });
    insertMany(records);
    res.status(201).json({ inserted: records.length });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/records/replace', (req, res) => {
  try {
    const { records, dates } = req.body as { records: any[]; dates: string[] };
    if (!records || records.length === 0) return res.status(400).json({ error: 'No records provided' });
    const deleteByDate = db.prepare('DELETE FROM production_records WHERE date = ?');
    const insert = db.prepare(
      'INSERT INTO production_records (id, date, worker_id, worker_name, set_number, item_number, quantity, upload_id, created_at, machine_name, hours_worked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const replaceAll = db.transaction(() => {
      for (const date of dates) { deleteByDate.run(date); }
      for (const r of records) {
        insert.run(r.id, r.date, r.worker_id, r.worker_name, r.set_number, r.item_number, r.quantity, r.upload_id, r.created_at, r.machine_name || null, r.hours_worked || null);
      }
    });
    replaceAll();
    res.status(201).json({ inserted: records.length });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.put('/api/production/records/:id', (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body as Partial<{ date: string; worker_id: string; worker_name: string; set_number: string; item_number: string; quantity: number; machine_name: string; hours_worked: number }>;
    const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    db.prepare(`UPDATE production_records SET ${sets} WHERE id = ?`).run(...values, id);
    res.json({ message: 'Record updated' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/records/all', (req, res) => {
  try {
    db.prepare('DELETE FROM production_records').run();
    res.json({ message: 'All production records deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/records/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM production_records WHERE id = ?').run(req.params.id);
    res.json({ message: 'Record deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

// ── PRODUCTION USER ACTIONS LOG ───────────────────────────────────────────────
app.get('/api/production/user-actions', (req, res) => {
  try {
    const { userName, dateStart, dateEnd } = req.query as Record<string, string>;
    let sql = 'SELECT * FROM production_user_actions WHERE 1=1';
    const params: any[] = [];
    if (userName) { sql += ' AND user_name LIKE ?'; params.push(`%${userName}%`); }
    if (dateStart) { sql += ' AND record_date >= ?'; params.push(dateStart); }
    if (dateEnd) { sql += ' AND record_date <= ?'; params.push(dateEnd); }
    sql += ' ORDER BY created_at DESC';
    res.json(db.prepare(sql).all(...params));
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/user-actions', (req, res) => {
  try {
    const { id, user_name, action, worker_id, worker_name, set_number, item_number, quantity, hours_worked, machine_name, record_date } = req.body;
    db.prepare(
      'INSERT INTO production_user_actions (id, user_name, action, worker_id, worker_name, set_number, item_number, quantity, hours_worked, machine_name, record_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, user_name, action, worker_id || null, worker_name || null, set_number || null, item_number || null, quantity || null, hours_worked || null, machine_name || null, record_date || null);
    res.status(201).json({ message: 'Action logged' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

// ── PRODUCTION ORDERS ─────────────────────────────────────────────────────────
app.get('/api/production/orders', (req, res) => {
  try {
    const { supplier, status, dateStart, dateEnd, orderNumber } = req.query as Record<string, string>;
    let sql = 'SELECT * FROM production_orders WHERE 1=1';
    const params: any[] = [];
    if (supplier) { sql += ' AND supplier LIKE ?'; params.push(`%${supplier}%`); }
    if (status) { sql += ' AND is_delivered = ?'; params.push(status); }
    if (dateStart) { sql += ' AND expected_delivery_date >= ?'; params.push(dateStart); }
    if (dateEnd) { sql += ' AND expected_delivery_date <= ?'; params.push(dateEnd); }
    if (orderNumber) { sql += ' AND order_number LIKE ?'; params.push(`%${orderNumber}%`); }
    sql += ' ORDER BY expected_delivery_date ASC';
    res.json(db.prepare(sql).all(...params));
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/orders/batch', (req, res) => {
  try {
    const { orders } = req.body as { orders: any[] };
    if (!orders || orders.length === 0) return res.status(400).json({ error: 'No orders provided' });
    const insert = db.prepare(
      `INSERT INTO production_orders (id, supplier, order_number, set_number, description, expected_delivery_date, quantity_expected, quantity_delivered, is_delivered, actual_delivered_date, actual_quantity_delivered, comment, week)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         supplier=excluded.supplier, order_number=excluded.order_number, set_number=excluded.set_number,
         description=excluded.description, expected_delivery_date=excluded.expected_delivery_date,
         quantity_expected=excluded.quantity_expected, quantity_delivered=excluded.quantity_delivered,
         week=excluded.week`
    );
    const insertMany = db.transaction((rows: any[]) => {
      for (const o of rows) {
        insert.run(o.id, o.supplier, o.order_number, o.set_number, o.description || null, o.expected_delivery_date, o.quantity_expected || 0, o.quantity_delivered || 0, o.is_delivered || 'in progress', o.actual_delivered_date || null, o.actual_quantity_delivered || null, o.comment || null, o.week || null);
      }
    });
    insertMany(orders);
    res.status(201).json({ inserted: orders.length });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/orders', (req, res) => {
  try {
    const { id, supplier, order_number, set_number, description, expected_delivery_date, quantity_expected, quantity_delivered, is_delivered, comment, department, updated_by, week } = req.body;
    db.prepare(
      `INSERT INTO production_orders (id, supplier, order_number, set_number, description, expected_delivery_date, quantity_expected, quantity_delivered, is_delivered, comment, department, updated_by, week) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, supplier || 'Unknown', order_number, set_number, description || null, expected_delivery_date, quantity_expected || 0, quantity_delivered || 0, is_delivered || 'in progress', comment || null, department || null, updated_by || null, week || null);
    res.status(201).json({ message: 'Order created' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.put('/api/production/orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { is_delivered, actual_delivered_date, actual_quantity_delivered, comment, department, updated_by, expected_delivery_date, week, supplier, order_number, set_number, description, quantity_expected } = req.body;
    db.prepare(
      `UPDATE production_orders SET
         is_delivered = ?, actual_delivered_date = ?, actual_quantity_delivered = ?,
         comment = ?, department = ?, updated_by = ?, expected_delivery_date = ?, week = ?,
         supplier = COALESCE(?, supplier), order_number = COALESCE(?, order_number),
         set_number = COALESCE(?, set_number), description = COALESCE(?, description),
         quantity_expected = COALESCE(?, quantity_expected)
       WHERE id = ?`
    ).run(is_delivered, actual_delivered_date || null, actual_quantity_delivered ?? null, comment || null, department || null, updated_by || null, expected_delivery_date, week || null, supplier || null, order_number || null, set_number || null, description || null, quantity_expected ?? null, id);
    res.json({ message: 'Order updated' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/orders/all', (req, res) => {
  try {
    db.prepare('DELETE FROM production_orders').run();
    res.json({ message: 'All orders deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/orders/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM production_orders WHERE id = ?').run(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

// ── PRODUCTION PLANNING ───────────────────────────────────────────────────────
app.get('/api/production/planning', (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM production_planning ORDER BY created_at DESC').all());
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/planning/batch', (req, res) => {
  try {
    const { records } = req.body as { records: any[] };
    if (!records || records.length === 0) return res.status(400).json({ error: 'No records provided' });
    const insert = db.prepare(
      `INSERT INTO production_planning (id, set_number, description, quantity, week, total_amount, total_number_in_box, total_number_of_pallets, order_numbers)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET set_number=excluded.set_number, description=excluded.description, quantity=excluded.quantity, week=excluded.week, total_amount=excluded.total_amount, total_number_in_box=excluded.total_number_in_box, total_number_of_pallets=excluded.total_number_of_pallets, order_numbers=excluded.order_numbers`
    );
    const insertMany = db.transaction((rows: any[]) => {
      for (const r of rows) {
        insert.run(r.id, String(r.set_number).trim(), r.description ? String(r.description).trim() : null, parseInt(r.quantity || '0'), r.week || null, r.total_amount != null ? parseFloat(r.total_amount) : null, r.total_number_in_box != null ? parseInt(r.total_number_in_box) : null, r.total_number_of_pallets != null ? parseInt(r.total_number_of_pallets) : null, r.order_numbers ? String(r.order_numbers).trim() : null);
      }
    });
    insertMany(records);
    res.status(201).json({ inserted: records.length });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.post('/api/production/planning', (req, res) => {
  try {
    const { id, set_number, description, quantity, week, total_amount, total_number_in_box, total_number_of_pallets, order_numbers } = req.body;
    db.prepare(
      'INSERT INTO production_planning (id, set_number, description, quantity, week, total_amount, total_number_in_box, total_number_of_pallets, order_numbers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, String(set_number).trim(), description || null, parseInt(quantity || '0'), week || null, total_amount != null ? parseFloat(total_amount) : null, total_number_in_box != null ? parseInt(total_number_in_box) : null, total_number_of_pallets != null ? parseInt(total_number_of_pallets) : null, order_numbers ? String(order_numbers).trim() : null);
    res.status(201).json({ message: 'Planning record created' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.put('/api/production/planning/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { set_number, description, quantity, week, total_amount, total_number_in_box, total_number_of_pallets, order_numbers } = req.body;
    db.prepare(
      'UPDATE production_planning SET set_number = ?, description = ?, quantity = ?, week = ?, total_amount = ?, total_number_in_box = ?, total_number_of_pallets = ?, order_numbers = ? WHERE id = ?'
    ).run(String(set_number).trim(), description || null, parseInt(quantity || '0'), week || null, total_amount != null ? parseFloat(total_amount) : null, total_number_in_box != null ? parseInt(total_number_in_box) : null, total_number_of_pallets != null ? parseInt(total_number_of_pallets) : null, order_numbers ? String(order_numbers).trim() : null, id);
    res.json({ message: 'Planning record updated' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/planning/all', (req, res) => {
  try {
    db.prepare('DELETE FROM production_planning').run();
    res.json({ message: 'All planning records deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

app.delete('/api/production/planning/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM production_planning WHERE id = ?').run(req.params.id);
    res.json({ message: 'Planning record deleted' });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

// ── WHATSAPP INTEGRATION ROUTES ───────────────────────────────────────────────
app.get('/api/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

app.get('/api/whatsapp/qr', (req, res) => {
  const status = getWhatsAppStatus();
  if (status.isConnected) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>WhatsApp Connected - GMAO</title><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0fdf4; color: #166534;">
          <div style="background: white; padding: 40px; border-radius: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 420px;">
            <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
            <h2 style="margin: 0 0 8px 0; color: #15803d;">WhatsApp Connecté !</h2>
            <p style="color: #4b5563; font-size: 14px; margin-bottom: 20px;">Le serveur GMAO est connecté et envoie automatiquement les alertes dans votre groupe.</p>
            <div style="background: #f3f4f6; padding: 14px 18px; border-radius: 14px; font-size: 13px; color: #374151; word-break: break-all; text-align: left;">
              <div style="margin-bottom: 6px;"><b>Groupe cible :</b> ${status.targetGroupName || 'Groupe WhatsApp'}</div>
              <div><b>ID Groupe (JID) :</b> <span style="font-family: monospace; font-size: 11px; color: #1f2937;">${status.targetGroupId || 'Connecté'}</span></div>
            </div>
          </div>
        </body>
      </html>
    `);
  }

  if (status.qrCodeDataUrl) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Scan WhatsApp QR - GMAO</title><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="5"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; color: #111827;">
          <div style="background: white; padding: 36px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); text-align: center; max-width: 440px;">
            <div style="font-size: 36px; margin-bottom: 8px;">📱</div>
            <h2 style="margin: 0 0 6px 0; font-size: 20px;">Associer WhatsApp à la GMAO</h2>
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 20px 0;">Ouvrez WhatsApp sur votre téléphone > <b>Appareils connectés</b> > <b>Connecter un appareil</b> et scannez ce QR Code.</p>
            <div style="display: inline-block; padding: 16px; background: #ffffff; border: 2px dashed #e5e7eb; border-radius: 16px;">
              <img src="${status.qrCodeDataUrl}" style="width: 260px; height: 260px; display: block;" alt="WhatsApp QR Code" />
            </div>
            <p style="color: #9ca3af; font-size: 11px; margin-top: 16px;">Cette page s'actualise automatiquement dès que vous scannez.</p>
          </div>
        </body>
      </html>
    `);
  }

  return res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>WhatsApp Initialisation - GMAO</title><meta charset="utf-8"><meta http-equiv="refresh" content="3"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb;">
        <div style="text-align: center; color: #6b7280;">
          <p style="font-size: 16px; font-weight: bold;">Génération du QR Code WhatsApp en cours...</p>
          <p style="font-size: 12px;">Veuillez patienter quelques secondes...</p>
        </div>
      </body>
    </html>
  `);
});

app.post('/api/whatsapp/test', async (req, res) => {
  try {
    const { sendWhatsAppMessage } = await import('./whatsappService.js');
    const success = await sendWhatsAppMessage(
      `🔔 *TEST DE CONNEXION GMAO*\n━━━━━━━━━━━━━━━━━━━━\nLe serveur GMAO Thermoplastics est correctement connecté et configuré pour envoyer les alertes de pannes et ordres de travail dans ce groupe.\n⏰ ${new Date().toLocaleString('fr-FR')}`
    );
    if (success) {
      res.json({ message: 'Message de test envoyé avec succès dans le groupe WhatsApp !' });
    } else {
      res.status(400).json({ error: 'WhatsApp non connecté ou groupe non accessible.' });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ── PRODUCTION DASHBOARD STATS ────────────────────────────────────────────────
app.get('/api/production/dashboard-stats', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const todayTotal = (db.prepare('SELECT COALESCE(SUM(quantity),0) as total FROM production_records WHERE date = ?').get(today) as any)?.total || 0;
    const pendingOrders = (db.prepare("SELECT COUNT(*) as cnt FROM production_orders WHERE is_delivered NOT IN ('yes','eliminated')").get() as any)?.cnt || 0;
    const monthRecords = db.prepare('SELECT worker_name, worker_id, SUM(quantity) as total FROM production_records WHERE date >= ? GROUP BY worker_id ORDER BY total DESC LIMIT 1').get(thirtyDaysAgo) as any;
    const planningItems = (db.prepare('SELECT COUNT(*) as cnt FROM production_planning').get() as any)?.cnt || 0;
    res.json({ todayTotal, pendingOrders, topWorker: monthRecords ? (monthRecords.worker_name || monthRecords.worker_id) : 'N/A', planningItems });
  } catch (error) { res.status(500).json({ error: (error as Error).message }); }
});

// ─── Vite Integration ──────────────────────────────────────────────────────────────

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/whatsapp_auth/**',
            '**/uploads/**',
            '**/backups/**',
            '**/*.db',
            '**/*.db-*',
          ],
        },
      },
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

  // Start WhatsApp Client
  initWhatsApp();
}

startServer();
