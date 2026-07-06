-- Database schema for GMAO Pro
CREATE DATABASE IF NOT EXISTS gmao_pro;
USE gmao_pro;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  uid VARCHAR(255) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  displayName VARCHAR(255),
  role ENUM('admin', 'manager', 'technician') NOT NULL DEFAULT 'technician'
);

-- Machines table
CREATE TABLE IF NOT EXISTS machines (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  serialNumber VARCHAR(255) NOT NULL,
  type VARCHAR(255),
  manufacturingYear INT,
  location VARCHAR(255),
  siteNumber VARCHAR(255),
  clampingForce INT,
  status ENUM('operational', 'down', 'maintenance', 'retired') NOT NULL DEFAULT 'operational',
  lastMaintenance DATETIME,
  nextMaintenance DATETIME,
  nextMaintenanceHours INT,
  currentHours DOUBLE DEFAULT 0,
  operationalStartTime DATETIME,
  lastHoursUpdate DATETIME,
  totalOperatingTime INT DEFAULT 0,
  totalDownTime INT DEFAULT 0,
  failureCount INT DEFAULT 0,
  manualUrl TEXT,
  injectingProduct TEXT,
  imageUrl TEXT
);

-- Preventive Tasks (Plan)
CREATE TABLE IF NOT EXISTS preventive_tasks (
  id VARCHAR(255) PRIMARY KEY,
  machineId VARCHAR(255),
  type ENUM('inspection', 'cleaning', 'lubrication', 'replacement', 'adjustment'),
  frequency ENUM('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'hours'),
  frequencyHours INT,
  description TEXT,
  FOREIGN KEY (machineId) REFERENCES machines(id) ON DELETE CASCADE
);

-- Fault Types (Categories)
CREATE TABLE IF NOT EXISTS fault_types (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parentId VARCHAR(255),
  FOREIGN KEY (parentId) REFERENCES fault_types(id) ON DELETE CASCADE
);

-- Spare Parts (Inventory)
CREATE TABLE IF NOT EXISTS spare_parts (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(255) UNIQUE,
  category VARCHAR(255),
  location VARCHAR(255),
  stock INT DEFAULT 0,
  minStock INT DEFAULT 0,
  unit VARCHAR(50)
);

-- Work Orders
CREATE TABLE IF NOT EXISTS work_orders (
  id VARCHAR(255) PRIMARY KEY,
  machineId VARCHAR(255),
  type ENUM('corrective', 'preventive') NOT NULL,
  priority ENUM('low', 'medium', 'high', 'critical') NOT NULL,
  status ENUM('pending', 'in-progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assignedTo VARCHAR(255),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME,
  parentFaultId VARCHAR(255),
  reportNumber VARCHAR(255),
  -- Initial intervention fields
  issuerName VARCHAR(255),
  issuerSector VARCHAR(255),
  requesterName VARCHAR(255),
  requestDate DATETIME,
  technicians TEXT,
  system VARCHAR(255),
  date DATETIME,
  location_ov VARCHAR(255), -- location override
  malfunctionDescription TEXT,
  FOREIGN KEY (machineId) REFERENCES machines(id) ON DELETE SET NULL,
  FOREIGN KEY (assignedTo) REFERENCES users(uid) ON DELETE SET NULL
);

-- Intervention Reports (Details for completed work orders)
CREATE TABLE IF NOT EXISTS intervention_reports (
  workOrderId VARCHAR(255) PRIMARY KEY,
  issuerName VARCHAR(255),
  issuerSector VARCHAR(255),
  requesterName VARCHAR(255),
  requestDate DATETIME,
  technicians TEXT,
  system VARCHAR(255),
  date DATETIME,
  location VARCHAR(255),
  malfunctionDescription TEXT,
  replacement BOOLEAN DEFAULT FALSE,
  diagnostic BOOLEAN DEFAULT FALSE,
  improvement BOOLEAN DEFAULT FALSE,
  control BOOLEAN DEFAULT FALSE,
  maintenanceType ENUM('corrective', 'preventive'),
  failureCause ENUM('wear', 'user', 'product', 'other'),
  relatedCause TEXT,
  interventionTime VARCHAR(255),
  actions TEXT,
  difficulties TEXT,
  startTime DATETIME,
  endTime DATETIME,
  durationMinutes INT,
  comments TEXT,
  completedAt DATETIME,
  FOREIGN KEY (workOrderId) REFERENCES work_orders(id) ON DELETE CASCADE
);

-- Parts used in interventions
CREATE TABLE IF NOT EXISTS intervention_parts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  workOrderId VARCHAR(255),
  partId VARCHAR(255),
  quantity INT,
  FOREIGN KEY (workOrderId) REFERENCES intervention_reports(workOrderId) ON DELETE CASCADE,
  FOREIGN KEY (partId) REFERENCES spare_parts(id) ON DELETE CASCADE
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId VARCHAR(255),
  username VARCHAR(255),
  action VARCHAR(255) NOT NULL,
  entityType ENUM('machine', 'workOrder', 'sparePart', 'user') NOT NULL,
  entityId VARCHAR(255),
  details TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(uid) ON DELETE SET NULL
);

-- Machine Condition History
CREATE TABLE IF NOT EXISTS machine_condition_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  machineId VARCHAR(255) NOT NULL,
  previousCondition TEXT,
  newCondition TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (machineId) REFERENCES machines(id) ON DELETE CASCADE
);

-- Purchase Requests History
CREATE TABLE IF NOT EXISTS purchase_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE NOT NULL,
    date TEXT NOT NULL,
    requested_by TEXT,
    department TEXT,
    supplier TEXT,
    items_count INTEGER,
    pdf_data TEXT, -- Base64 encoded PDF
    status TEXT DEFAULT 'Waiting for validation',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
