import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const sqlite = new SQLiteConnection(CapacitorSQLite);
let dbInstance = null;

/**
 * Initialise et ouvre la connexion à la base SQLite locale du téléphone
 */
export async function getDb() {
  if (dbInstance) return dbInstance;

  try {
    // Création / Ouverture du fichier 'hevea.db' dans la mémoire du téléphone
    dbInstance = await sqlite.createConnection('hevea.db', false, 'no-encryption', 1, false);
    await dbInstance.open();

    // Activation des contraintes de clés étrangères
    await dbInstance.execute('PRAGMA foreign_keys = ON;');

    // Création de toutes tes tables d'origine
    const schema = `
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        identifiant TEXT UNIQUE NOT NULL,
        mot_de_passe_hash TEXT NOT NULL,
        cree_le TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS planteurs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        prenoms TEXT NOT NULL,
        contact TEXT,
        contact_paiement TEXT,
        moyen_paiement TEXT,
        identifiant TEXT UNIQUE NOT NULL,
        mot_de_passe_hash TEXT NOT NULL,
        mot_de_passe_temporaire INTEGER DEFAULT 1,
        statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','inactif')),
        cree_le TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS prix_mois (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        periode TEXT UNIQUE NOT NULL,
        prix_kg REAL NOT NULL,
        defini_le TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pesees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        planteur_id INTEGER NOT NULL REFERENCES planteurs(id) ON DELETE CASCADE,
        periode TEXT NOT NULL,
        date_pesee TEXT NOT NULL,
        poids_kg REAL NOT NULL CHECK (poids_kg > 0),
        cree_le TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_pesees_periode ON pesees(periode);
      CREATE INDEX IF NOT EXISTS idx_pesees_planteur ON pesees(planteur_id);
    `;

    await dbInstance.execute(schema);

    // Initialisation du compte admin par défaut si la base vient d'être créée
    const res = await dbInstance.query('SELECT COUNT(*) AS n FROM admins;');
    if (res.values && res.values[0].n === 0) {
      // Hash par défaut ou chaîne de test
      await dbInstance.run(
        'INSERT INTO admins (nom, identifiant, mot_de_passe_hash) VALUES (?, ?, ?);',
        ['Administrateur', 'admin', 'ChangerCeMotDePasse123']
      );
    }

    console.log("Base de données SQLite Android prête !");
    return dbInstance;
  } catch (err) {
    console.error("Erreur lors de l'initialisation SQLite :", err);
  }
}