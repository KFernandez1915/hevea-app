// Reinitialise le mot de passe du compte administrateur existant.
// Usage : node src/reset-admin-password.js [identifiant] [nouveau_mot_de_passe]
// Sans argument, reinitialise le mot de passe de "admin" (ou du premier
// compte admin trouve) sur "admin123".
const bcrypt = require('bcryptjs');
const db = require('./db');

const identifiant = process.argv[2];
const nouveauMotDePasse = process.argv[3] || 'admin123';

let admin;
if (identifiant) {
  admin = db.prepare('SELECT * FROM admins WHERE identifiant = ?').get(identifiant);
  if (!admin) {
    console.error(`Aucun compte admin trouve avec l'identifiant "${identifiant}".`);
    process.exit(1);
  }
} else {
  admin = db.prepare('SELECT * FROM admins ORDER BY id LIMIT 1').get();
  if (!admin) {
    console.error("Aucun compte admin n'existe encore. Demarrez le serveur une fois pour en creer un automatiquement.");
    process.exit(1);
  }
}

const hash = bcrypt.hashSync(nouveauMotDePasse, 10);
db.prepare('UPDATE admins SET mot_de_passe_hash = ? WHERE id = ?').run(hash, admin.id);

console.log(`Mot de passe mis a jour pour l'administrateur "${admin.identifiant}" -> nouveau mot de passe : "${nouveauMotDePasse}"`);
console.log('Pensez a le changer a nouveau si vous le partagez ou le laissez tel quel temporairement.');
