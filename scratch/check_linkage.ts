import db from '../db.js';

const machines = db.prepare("SELECT name, siteNumber, serialNumber FROM machines LIMIT 5").all();
console.log('--- Machines Sample ---');
console.log(machines);

const rendements = db.prepare("SELECT machineNumber FROM machine_rendement LIMIT 5").all();
console.log('--- Rendements Sample ---');
console.log(rendements);
