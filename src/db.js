const fs = require('fs');
const path = require('path');

// =========================================================
// 1. DÉCLARATION ET INITIALISATION DE DB (GARDE TON CODE EXISTANT ICI)
// =========================================================
// Exemple si tu utilises node:sqlite ou better-sqlite3 :
// const Database = require('better-sqlite3');
// const db = new Database(path.join(__dirname, '../hevea.db'));

// (Assure-toi que la variable 'db' ou 'database' est bien créée au-dessus de cette ligne)


// =========================================================
// 2. FONCTION D'IMPORT AUTOMATIQUE SÉCURISÉE
// =========================================================
function autoImportInitialData() {
  try {
    // Si 'db' porte un autre nom (ex: 'database' ou 'sqlite'), remplace 'db' ci-dessous :
    if (typeof db === 'undefined') {
      console.log("⚠️ Objet db non trouvé, saut de l'auto-import.");
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
        }
      }
    }
  } catch (err) {
    // Capturer l'erreur sans faire planter l'application (status 1)
    console.error("❌ Erreur lors de l'auto-importation :", err.message);
  }
}

// 3. Appel de la fonction APRES la création de 'db'
autoImportInitialData();

// 4. Export de la base
module.exports = db;