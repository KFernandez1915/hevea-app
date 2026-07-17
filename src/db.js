const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// 1. Définition du chemin et création de la connexion SQLite
const dbPath = path.resolve(__dirname, '../hevea.db');
const db = new DatabaseSync(dbPath);

// 2. Fonction d'importation automatique des données initiales
function autoImportInitialData() {
  try {
    // Vérifier si la table planteurs existe
    const checkTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='planteurs'").get();

    if (checkTable) {
      const row = db.prepare("SELECT COUNT(*) as count FROM planteurs").get();

      if (row && row.count === 0) {
        console.log("⚠️ Base de données vide sur Render. Importation des données initiales...");

        const sqlPath = path.resolve(__dirname, '../public/js/initial-data.sql');

        if (fs.existsSync(sqlPath)) {
          const sqlScript = fs.readFileSync(sqlPath, 'utf8');
          db.exec(sqlScript);
          console.log("✅ Données initiales importées avec succès sur Render !");
        } else {
          console.log("⚠️ Fichier initial-data.sql introuvable à l'emplacement :", sqlPath);
        }
      }
    }
  } catch (err) {
    console.error("❌ Erreur lors de l'auto-importation :", err.message);
  }
}

// 3. Exécution de l'importation automatique
autoImportInitialData();

// 4. Exporter la base de données pour le reste de l'application
module.exports = db;