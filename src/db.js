const fs = require('fs');
const path = require('path');

// 1. Initialisation / Connexion à la base SQLite
// (Conserve ta ligne exacte de connexion SQLite ici, par exemple avec better-sqlite3 ou sqlite3)
// EXEMPLE : const Database = require('better-sqlite3');
// EXEMPLE : const db = new Database(path.join(__dirname, '../data/hevea.db'));

function autoImportInitialData() {
  try {
    // Vérification que l'objet db existe bel et bien
    if (typeof db === 'undefined' || !db) {
      console.log("⚠️ La connexion 'db' n'est pas encore prête.");
      return;
    }

    // Vérifie si la table planteurs existe
    const checkTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='planteurs'").get();

    if (checkTable) {
      const row = db.prepare("SELECT COUNT(*) as count FROM planteurs").get();

      if (row && row.count === 0) {
        console.log("⚠️ Base de données vide sur Render. Importation des données initiales...");

        const sqlPath = path.resolve(__dirname, '../public/js/initial-data.sql');

        if (fs.existsSync(sqlPath)) {
          const sqlScript = fs.readFileSync(sqlPath, 'utf8');

          if (typeof db.exec === 'function') {
            db.exec(sqlScript);
          } else {
            const statements = sqlScript.split(';').filter(cmd => cmd.trim() !== '');
            for (const statement of statements) {
              db.prepare(statement).run();
            }
          }
          console.log("✅ Données importées avec succès sur Render !");
        } else {
          console.log("⚠️ Fichier initial-data.sql introuvable au chemin :", sqlPath);
        }
      }
    }
  } catch (err) {
    console.error("❌ Erreur lors de l'auto-importation :", err.message);
  }
}

// 2. Exécution de l'import APRES l'initialisation de 'db'
autoImportInitialData();

module.exports = db;