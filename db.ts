import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'gmao.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    displayName TEXT,
    role TEXT NOT NULL DEFAULT 'technician',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS machines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    serialNumber TEXT NOT NULL,
    siteNumber TEXT,
    type TEXT,
    manufacturingYear INTEGER,
    location TEXT,
    clampingForce INTEGER,
    status TEXT NOT NULL DEFAULT 'operational',
    lastMaintenance TEXT,
    nextMaintenance TEXT,
    nextMaintenanceHours INTEGER,
    currentHours REAL DEFAULT 0,
    operationalStartTime TEXT,
    lastHoursUpdate TEXT,
    totalOperatingTime INTEGER DEFAULT 0,
    totalDownTime INTEGER DEFAULT 0,
    failureCount INTEGER DEFAULT 0,
    condition TEXT,
    preventivePlan TEXT,
    injectingProduct TEXT,
    manualUrl TEXT,
    imageUrl TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS preventive_tasks (
    id TEXT PRIMARY KEY,
    machineId TEXT,
    type TEXT,
    frequency TEXT,
    frequencyHours INTEGER,
    description TEXT,
    FOREIGN KEY (machineId) REFERENCES machines(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS fault_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parentId TEXT,
    FOREIGN KEY (parentId) REFERENCES fault_types(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS spare_parts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    category TEXT,
    location TEXT,
    stock INTEGER DEFAULT 0,
    minStock INTEGER DEFAULT 0,
    unit TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_orders (
    id TEXT PRIMARY KEY,
    machineId TEXT,
    type TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    title TEXT NOT NULL,
    description TEXT,
    assignedTo TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    completedAt TEXT,
    parentFaultId TEXT,
    reportNumber TEXT,
    issuerName TEXT,
    issuerSector TEXT,
    requesterName TEXT,
    requestDate TEXT,
    technicians TEXT,
    system TEXT,
    date TEXT,
    location TEXT,
    location_ov TEXT,
    malfunctionDescription TEXT,
    machineName TEXT,
    createdBy TEXT,
    createdByName TEXT,
    intervention TEXT,
    assignedName TEXT,
    childFaultIds TEXT,
    updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (machineId) REFERENCES machines(id) ON DELETE SET NULL,
    FOREIGN KEY (assignedTo) REFERENCES users(uid) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS intervention_reports (
    workOrderId TEXT PRIMARY KEY,
    issuerName TEXT,
    issuerSector TEXT,
    requesterName TEXT,
    requestDate TEXT,
    technicians TEXT,
    system TEXT,
    date TEXT,
    location TEXT,
    malfunctionDescription TEXT,
    replacement INTEGER DEFAULT 0,
    diagnostic INTEGER DEFAULT 0,
    improvement INTEGER DEFAULT 0,
    control INTEGER DEFAULT 0,
    maintenanceType TEXT,
    failureCause TEXT,
    relatedCause TEXT,
    interventionTime TEXT,
    actions TEXT,
    difficulties TEXT,
    startTime TEXT,
    endTime TEXT,
    durationMinutes INTEGER,
    comments TEXT,
    completedAt TEXT,
    FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS intervention_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workOrderId TEXT,
    partId TEXT,
    quantity INTEGER,
    FOREIGN KEY (workOrderId) REFERENCES intervention_reports(workOrderId) ON DELETE CASCADE,
    FOREIGN KEY (partId) REFERENCES spare_parts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    username TEXT,
    action TEXT NOT NULL,
    entityType TEXT NOT NULL,
    entityId TEXT,
    details TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(uid) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS machine_condition_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    machineId TEXT NOT NULL,
    previousCondition TEXT,
    newCondition TEXT NOT NULL,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (machineId) REFERENCES machines(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS machine_rendement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    machineNumber TEXT DEFAULT '',
    item TEXT NOT NULL,
    targetQty REAL DEFAULT 0,
    qtyShift1 REAL DEFAULT 0,
    qtyShift2 REAL DEFAULT 0,
    qtyShift3 REAL DEFAULT 0,
    efficiencyShift1 REAL DEFAULT 0,
    efficiencyShift2 REAL DEFAULT 0,
    efficiencyShift3 REAL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migrations for missing columns
const migrations = [
  { table: 'machines', column: 'condition', type: 'TEXT' },
  { table: 'machines', column: 'preventivePlan', type: 'TEXT' },
  { table: 'machines', column: 'injectingProduct', type: 'TEXT' },
  { table: 'machines', column: 'createdAt', type: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
  { table: 'machines', column: 'updatedAt', type: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
  { table: 'work_orders', column: 'intervention', type: 'TEXT' },
  { table: 'work_orders', column: 'assignedName', type: 'TEXT' },
  { table: 'work_orders', column: 'childFaultIds', type: 'TEXT' },
  { table: 'work_orders', column: 'location', type: 'TEXT' },
  { table: 'work_orders', column: 'machineName', type: 'TEXT' },
  { table: 'work_orders', column: 'createdBy', type: 'TEXT' },
  { table: 'work_orders', column: 'createdByName', type: 'TEXT' },
  { table: 'work_orders', column: 'updatedAt', type: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
  { table: 'users', column: 'createdAt', type: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
  { table: 'users', column: 'updatedAt', type: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
  { table: 'spare_parts', column: 'createdAt', type: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
  { table: 'spare_parts', column: 'updatedAt', type: 'TEXT DEFAULT CURRENT_TIMESTAMP' },
  { table: 'machines', column: 'imageUrl', type: 'TEXT' },
  { table: 'machines', column: 'siteNumber', type: 'TEXT' },
  { table: 'machine_rendement', column: 'machineNumber', type: 'TEXT DEFAULT \'\'' }
];

for (const m of migrations) {
  try {
    db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
  } catch (e) {
    // Column might already exist
  }
}

// Create default admin user if none exists
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
if (userCount.count === 0) {
  const uid = 'admin-uid';

  db.prepare(
    'INSERT INTO users (uid, username, password, displayName, role) VALUES (?, ?, ?, ?, ?)'
  ).run(uid, 'admin', 'admin', 'Administrator', 'admin');

  console.log('Default admin user created: admin / admin');
}

export default db;
