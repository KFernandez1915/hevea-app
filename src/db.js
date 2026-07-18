const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'hevea.db'));
console.log("Base utilisée :", path.join(DATA_DIR, "hevea.db"));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
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
  periode TEXT UNIQUE NOT NULL,          -- format 'YYYY-MM'
  prix_kg REAL NOT NULL,
  defini_le TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pesees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  planteur_id INTEGER NOT NULL REFERENCES planteurs(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,                 -- format 'YYYY-MM', mois de rattachement
  date_pesee TEXT NOT NULL,              -- date exacte du passage
  poids_kg REAL NOT NULL CHECK (poids_kg > 0),
  cree_le TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pesees_periode ON pesees(periode);
CREATE INDEX IF NOT EXISTS idx_pesees_planteur ON pesees(planteur_id);

CREATE TABLE IF NOT EXISTS informations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titre TEXT NOT NULL,
  contenu TEXT,
  fichier_nom TEXT,
  fichier_type TEXT,        -- 'image', 'video', 'audio' ou NULL
  fichier_mime TEXT,
  cree_le TEXT DEFAULT (datetime('now'))
);
`);

// --- Migration legere : colonnes de reinitialisation de mot de passe (planteurs) ---
// Ajoutees via ALTER TABLE pour ne pas casser les bases existantes deja en place.
const colonnesPlanteurs = db.prepare("PRAGMA table_info(planteurs)").all().map((c) => c.name);
const migrationsReset = [
  ['reset_code_hash', "ALTER TABLE planteurs ADD COLUMN reset_code_hash TEXT"],
  ['reset_expire_le', "ALTER TABLE planteurs ADD COLUMN reset_expire_le TEXT"],
  ['reset_tentatives', "ALTER TABLE planteurs ADD COLUMN reset_tentatives INTEGER DEFAULT 0"],
  ['reset_demande_le', "ALTER TABLE planteurs ADD COLUMN reset_demande_le TEXT"],
];
for (const [colonne, sql] of migrationsReset) {
  if (!colonnesPlanteurs.includes(colonne)) {
    db.exec(sql);
  }
}

// Compte admin par defaut si aucun n'existe (identifiants a changer immediatement)
const adminCount = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
if (adminCount === 0) {
  const defaultUser = process.env.ADMIN_DEFAULT_USER || 'admin';
  const defaultPass = process.env.ADMIN_DEFAULT_PASSWORD || 'ChangerCeMotDePasse123';
  const hash = bcrypt.hashSync(defaultPass, 10);
  db.prepare('INSERT INTO admins (nom, identifiant, mot_de_passe_hash) VALUES (?, ?, ?)')
    .run('Administrateur', defaultUser, hash);
  console.log(`[hevea-app] Compte admin initial cree -> identifiant: "${defaultUser}" / mot de passe: "${defaultPass}" (a changer)`);
}

module.exports = db;