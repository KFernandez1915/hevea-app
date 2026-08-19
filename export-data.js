const fs = require('fs');
const path = require('path');
const db = require('./src/db'); // ou le bon chemin vers votre db.js

// Liste blanche stricte des tables exportables : le nom de table ne doit
// jamais provenir directement d'une variable interpolee sans validation,
// meme lorsque la source est un tableau code en dur.
const TABLES_AUTORISEES = new Set(['admins', 'planteurs', 'prix_mois', 'pesees']);

function exporterDonnees() {
  const tables = ['admins', 'planteurs', 'prix_mois', 'pesees'];
  let sqlExport = [];

  for (const table of tables) {
    if (!TABLES_AUTORISEES.has(table)) {
      console.error(`Table non autorisee, ignoree : ${table}`);
      continue;
    }
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

  // IMPORTANT : ce fichier contient des donnees personnelles (noms, contacts,
  // moyens de paiement) et des hashs de mots de passe. Il ne doit JAMAIS etre
  // ecrit dans public/ (servi tel quel par Express) ni commite dans Git.
  // Il est ecrit dans un dossier prive, exclu via .gitignore.
  const outputDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `export-${horodatage}.sql`);
  fs.writeFileSync(outputPath, sqlExport.join('\n'), 'utf8');
  console.log(`\n✅ Données exportées avec succès dans : ${outputPath}`);
  console.log('⚠️  Ce fichier contient des données personnelles et des hashs de mots de passe.');
  console.log('⚠️  Ne le committez jamais dans Git et ne le placez jamais dans public/.');
}

exporterDonnees();
