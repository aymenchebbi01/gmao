import db from '../db.js';

const orders = db.prepare("SELECT id, title, type, createdAt, date FROM work_orders WHERE type = 'preventive'").all();
console.log('--- Preventive Work Orders ---');
console.log(orders);
console.log('------------------------------');

const machines = db.prepare("SELECT id, name, nextMaintenance FROM machines WHERE nextMaintenance IS NOT NULL AND nextMaintenance != ''").all();
console.log('--- Machines with Next Maintenance Date ---');
console.log(machines);
console.log('------------------------------------------');
