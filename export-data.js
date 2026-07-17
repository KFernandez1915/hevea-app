const fs = require('fs');
const path = require('path');
const db = require('./src/db'); // ou le bon chemin vers votre db.js

function exporterDonnees() {
  const tables = ['admins', 'planteurs', 'prix_mois', 'pesees'];
  let sqlExport = [];

  for (const table of tables) {
    try {
      // Préparation et exécution adaptées à node:sqlite (DatabaseSync)
      const stmt = db.prepare(`SELECT * FROM ${table}`);
      const rows = stmt.all();

      for (const row of rows) {
        const keys = Object.keys(row).join(', ');
        const values = Object.values(row)
          .map(v => (v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`))
          .join(', ');
        
        sqlExport.push(`INSERT OR IGNORE INTO ${table} (${keys}) VALUES (${values});`);
      }
    } catch (err) {
      console.error(`Erreur lors de l'export de la table ${table}:`, err.message);
    }
  }

  // S'assurer que le dossier public/js existe
  const outputDir = path.join(__dirname, 'public', 'js');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, 'initial-data.sql');
  fs.writeFileSync(outputPath, sqlExport.join('\n'), 'utf8');
  console.log(`\n✅ Données exportées avec succès dans : ${outputPath}`);
}

exporterDonnees();