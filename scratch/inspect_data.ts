import db from '../db.js';

const machines: any[] = db.prepare('SELECT id, name, nextMaintenance, nextMaintenanceHours, currentHours FROM machines').all();
console.log('--- Machines Maintenance Data ---');
machines.forEach(m => {
  console.log(`Machine: ${m.name} (ID: ${m.id})`);
  console.log(`  nextMaintenance: ${m.nextMaintenance}`);
  console.log(`  nextMaintenanceHours: ${m.nextMaintenanceHours}`);
  console.log(`  currentHours: ${m.currentHours}`);
});
console.log('---------------------------------');
