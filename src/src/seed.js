const bcrypt = require('bcryptjs');
const db = require('./db');
const { genererIdentifiant, genererMotDePasseTemporaire, periodeCourante } = require('./utils/helpers');

const demoPlanteurs = [
  { nom: 'Kouassi', prenoms: 'Jean', contact: '0700000001', moyen_paiement: 'Mobile Money', contact_paiement: '0700000001' },
  { nom: 'Yao', prenoms: 'Marie', contact: '0700000002', moyen_paiement: 'Mobile Money', contact_paiement: '0700000002' },
  { nom: 'Kone', prenoms: 'Ibrahim', contact: '0700000003', moyen_paiement: 'Virement bancaire', contact_paiement: 'CI00 XXXX XXXX' },
];

const existants = new Set(db.prepare('SELECT identifiant FROM planteurs').all().map((r) => r.identifiant));
const idsInseres = [];

demoPlanteurs.forEach((pl) => {
  const identifiant = genererIdentifiant(pl.nom, pl.prenoms, existants);
  existants.add(identifiant);
  const motDePasse = genererMotDePasseTemporaire();
  const hash = bcrypt.hashSync(motDePasse, 10);
  const info = db.prepare(`
    INSERT INTO planteurs (nom, prenoms, contact, contact_paiement, moyen_paiement, identifiant, mot_de_passe_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(pl.nom, pl.prenoms, pl.contact, pl.contact_paiement, pl.moyen_paiement, identifiant, hash);
  idsInseres.push(info.lastInsertRowid);
  console.log(`Planteur cree: ${pl.prenoms} ${pl.nom} -> identifiant: ${identifiant} / mot de passe: ${motDePasse}`);
});

const periode = periodeCourante();
db.prepare(`
  INSERT INTO prix_mois (periode, prix_kg) VALUES (?, ?)
  ON CONFLICT(periode) DO UPDATE SET prix_kg = excluded.prix_kg
`).run(periode, 350);

const today = new Date().toISOString().slice(0, 10);
idsInseres.forEach((id, i) => {
  db.prepare('INSERT INTO pesees (planteur_id, periode, date_pesee, poids_kg) VALUES (?, ?, ?, ?)')
    .run(id, periode, today, 100 + i * 25);
});

console.log(`Prix du kg defini pour ${periode} : 350 FCFA. Donnees de demonstration inserees.`);
