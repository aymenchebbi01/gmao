import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDbPath = path.join(__dirname, '..', 'production101', 'production.db');

if (!fs.existsSync(sourceDbPath)) {
  console.log(`⚠️ Source database not found at: ${sourceDbPath}. Skipping data migration.`);
  process.exit(0);
}

console.log('🔄 Starting data migration from production101 -> GMAO...');

const sourceDb = new Database(sourceDbPath);
const targetDb = db;

try {
  targetDb.exec('BEGIN TRANSACTION');

  // 1. Production Lines
  try {
    const lines = sourceDb.prepare('SELECT * FROM machines').all() as any[];
    const stmt = targetDb.prepare(
      'INSERT OR IGNORE INTO production_lines (id, name, cadence, category) VALUES (?, ?, ?, ?)'
    );
    let count = 0;
    for (const l of lines) {
      stmt.run(l.id, l.name, l.cadence, l.category || null);
      count++;
    }
    console.log(`✅ Migrated ${count} production lines`);
  } catch (err: any) {
    console.error('Error migrating machines -> production_lines:', err.message);
  }

  // 2. Production Workers
  try {
    const workers = sourceDb.prepare('SELECT * FROM workers').all() as any[];
    const stmt = targetDb.prepare(
      'INSERT OR IGNORE INTO production_workers (id, worker_id, name) VALUES (?, ?, ?)'
    );
    let count = 0;
    for (const w of workers) {
      stmt.run(w.id, w.worker_id, w.name);
      count++;
    }
    console.log(`✅ Migrated ${count} production workers`);
  } catch (err: any) {
    console.error('Error migrating workers -> production_workers:', err.message);
  }

  // 3. Production Records
  try {
    const records = sourceDb.prepare('SELECT * FROM production').all() as any[];
    const stmt = targetDb.prepare(
      'INSERT OR IGNORE INTO production_records (id, date, worker_id, worker_name, set_number, item_number, quantity, upload_id, machine_name, hours_worked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    let count = 0;
    for (const r of records) {
      stmt.run(
        r.id,
        r.date,
        r.worker_id,
        r.worker_name || null,
        r.set_number || null,
        r.item_number || null,
        r.quantity,
        r.upload_id || null,
        r.machine_name || null,
        r.hours_worked || null,
        r.created_at || new Date().toISOString()
      );
      count++;
    }
    console.log(`✅ Migrated ${count} production records`);
  } catch (err: any) {
    console.error('Error migrating production -> production_records:', err.message);
  }

  // 4. Production Orders
  try {
    const orders = sourceDb.prepare('SELECT * FROM orders').all() as any[];
    const stmt = targetDb.prepare(
      `INSERT OR IGNORE INTO production_orders (id, supplier, order_number, set_number, description, expected_delivery_date, quantity_expected, quantity_delivered, is_delivered, actual_delivered_date, actual_quantity_delivered, comment, department, updated_by, week, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let count = 0;
    for (const o of orders) {
      stmt.run(
        o.id,
        o.supplier,
        o.order_number,
        o.set_number,
        o.description || null,
        o.expected_delivery_date,
        o.quantity_expected || 0,
        o.quantity_delivered || 0,
        o.is_delivered || 'in progress',
        o.actual_delivered_date || null,
        o.actual_quantity_delivered || null,
        o.comment || null,
        o.department || null,
        o.updated_by || null,
        o.week || null,
        o.created_at || new Date().toISOString()
      );
      count++;
    }
    console.log(`✅ Migrated ${count} production orders`);
  } catch (err: any) {
    console.error('Error migrating orders -> production_orders:', err.message);
  }

  // 5. Production Planning
  try {
    const planning = sourceDb.prepare('SELECT * FROM planning').all() as any[];
    const stmt = targetDb.prepare(
      `INSERT OR IGNORE INTO production_planning (id, set_number, description, quantity, week, total_amount, total_number_in_box, total_number_of_pallets, order_numbers, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let count = 0;
    for (const p of planning) {
      stmt.run(
        p.id,
        p.set_number,
        p.description || null,
        p.quantity,
        p.week || null,
        p.total_amount || null,
        p.total_number_in_box || null,
        p.total_number_of_pallets || null,
        p.order_numbers || null,
        p.created_at || new Date().toISOString()
      );
      count++;
    }
    console.log(`✅ Migrated ${count} production planning entries`);
  } catch (err: any) {
    console.error('Error migrating planning -> production_planning:', err.message);
  }

  targetDb.exec('COMMIT');
  console.log('🎉 Data migration script executed successfully!');
} catch (err: any) {
  targetDb.exec('ROLLBACK');
  console.error('❌ Data migration failed:', err.message);
} finally {
  sourceDb.close();
}
