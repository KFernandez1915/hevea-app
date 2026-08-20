const fs = require('fs');
const path = require('path');
const db = require('./src/db');

// Liste blanche stricte des tables exportables.
const TABLES_AUTORISEES = new Set(['admins', 'planteurs', 'prix_mois', 'pesees']);

function exporterDonnees() {
  const tables = ['admins', 'planteurs', 'prix_mois', 'pesees'];
  const sqlExport = [];

  for (const table of tables) {
    if (!TABLES_AUTORISEES.has(table)) {
      process.stderr.write(`Table non autorisee, ignoree : ${table}\n`);
      continue;
    }

    try {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();

      for (const row of rows) {
        const keys = Object.keys(row).join(', ');
        const values = Object.values(row)
          .map((v) => (v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`))
          .join(', ');

        sqlExport.push(`INSERT OR IGNORE INTO ${table} (${keys}) VALUES (${values});`);
      }
    } catch (err) {
      process.stderr.write(`Erreur lors de l'export de la table ${table}: ${err.message}\n`);
    }
  }

  // Donnees personnelles + hashs : dossier prive, exclu de Git.
  const outputDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `export-${horodatage}.sql`);
  fs.writeFileSync(outputPath, sqlExport.join('\n'), 'utf8');

  process.stdout.write(`\nDonnees exportees avec succes dans : ${outputPath}\n`);
  process.stdout.write('Attention : ce fichier contient des donnees personnelles et des hashs de mots de passe.\n');
  process.stdout.write('Ne le committez jamais dans Git et ne le placez jamais dans public/.\n');
}

exporterDonnees();
