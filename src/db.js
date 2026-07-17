const fs = require('fs');
const path = require('path');

function autoImportInitialData() {
  try {
    // 1. Vérification sécurisée si la table existe et est vide
    const checkTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='planteurs'").get();
    
    if (checkTable) {
      const row = db.prepare("SELECT COUNT(*) as count FROM planteurs").get();
      
      if (row && row.count === 0) {
        console.log("⚠️ Base de données vide détectée sur Render. Tentative d'importation...");

        // Chemin absolu compatible Windows et Linux
        const sqlPath = path.resolve(__dirname, '../public/js/initial-data.sql');

        if (fs.existsSync(sqlPath)) {
          const sqlScript = fs.readFileSync(sqlPath, 'utf8');

          // Exécution sécurisée des requêtes SQL
          if (typeof db.exec === 'function') {
            db.exec(sqlScript);
          } else {
            // Si la méthode exec n'existe pas selon ton driver sqlite
            const statements = sqlScript.split(';').filter(cmd => cmd.trim() !== '');
            for (const statement of statements) {
              db.prepare(statement).run();
            }
          }
          console.log("✅ Données importées avec succès !");
        } else {
          console.log("⚠️ Fichier initial-data.sql introuvable au chemin :", sqlPath);
        }
      }
    }
  } catch (err) {
    // Affiche l'erreur dans la console sans faire planter le serveur Web
    console.error("❌ Erreur lors de l'auto-import :", err.message);
  }
}

// Lancer l'import
autoImportInitialData();