const fs = require('fs');
const path = require('path');
// Votre initialisation SQLite actuelle (ex: DatabaseSync ou sqlite3)
const db = require('./db'); // Ajustez selon votre fichier actuel

function autoImportInitialData() {
  try {
    // Vérifier si la table planteurs est vide
    const planteursCount = db.prepare("SELECT COUNT(*) as count FROM planteurs").get();

    if (planteursCount && planteursCount.count === 0) {
      console.log("⚠️ La base de données est vide. Importation des données initiales...");
      
      const sqlPath = path.join(__dirname, '..', 'public', 'js', 'initial-data.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        // Exécuter toutes les requêtes INSERT du fichier SQL
        db.exec(sql);
        console.log("✅ Données initiales importées avec succès sur Render !");
      }
    }
  } catch (err) {
    console.error("Erreur lors de l'auto-importation :", err.message);
  }
}

autoImportInitialData();