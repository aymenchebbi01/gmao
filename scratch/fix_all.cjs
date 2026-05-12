const Database = require('better-sqlite3');
const db = new Database('gmao.db');

try {
  // Check machines table
  const machInfo = db.prepare("PRAGMA table_info(machines)").all();
  const hasSiteNo = machInfo.some(col => col.name === 'siteNumber');
  if (!hasSiteNo) {
    console.log('ADDING siteNumber TO machines...');
    db.prepare("ALTER TABLE machines ADD COLUMN siteNumber TEXT").run();
  }

  // Check machine_rendement table
  const rendInfo = db.prepare("PRAGMA table_info(machine_rendement)").all();
  const hasMachNum = rendInfo.some(col => col.name === 'machineNumber');
  if (!hasMachNum) {
    console.log('ADDING machineNumber TO machine_rendement...');
    db.prepare("ALTER TABLE machine_rendement ADD COLUMN machineNumber TEXT DEFAULT ''").run();
  }

  console.log('MIGRATION COMPLETE.');
} catch (e) {
  console.error(e);
} finally {
  db.close();
}
