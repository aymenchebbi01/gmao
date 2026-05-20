import db from '../db.js';

const machines = db.prepare("SELECT name, preventivePlan, lastMaintenance FROM machines WHERE preventivePlan IS NOT NULL AND preventivePlan != '[]'").all();
console.log('--- Machines with Preventive Plans ---');
machines.forEach(m => {
  console.log(`Machine: ${m.name}`);
  console.log(`  Plan: ${m.preventivePlan}`);
  console.log(`  Last Maintenance: ${m.lastMaintenance}`);
});
console.log('--------------------------------------');
