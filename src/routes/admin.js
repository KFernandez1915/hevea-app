const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { exigerAdmin } = require('../middleware/auth');
const { genererMotDePasseTemporaire, genererIdentifiant, periodeCourante } = require('../utils/helpers');
const { envoyerIdentifiantsParSms } = require('../utils/sms');
const { genererExcelRecap, genererPdfRecap } = require('../utils/export');

const router = express.Router();
router.use(exigerAdmin);

function calculerRecap(periode) {
  const prixRow = db.prepare('SELECT prix_kg FROM prix_mois WHERE periode = ?').get(periode);
  const prixKg = prixRow ? prixRow.prix_kg : null;

  const lignes = db.prepare(`
    SELECT p.id AS planteur_id,
           (p.prenoms || ' ' || p.nom) AS nom_complet,
           p.contact AS contact,
           COUNT(pz.id) AS nb_pesees,
           COALESCE(SUM(pz.poids_kg), 0) AS poids_total
    FROM planteurs p
    JOIN pesees pz ON pz.planteur_id = p.id AND pz.periode = ?
    WHERE p.statut = 'actif'
    GROUP BY p.id
    ORDER BY nom_complet
  `).all(periode).map((l) => ({
    ...l,
    montant: prixKg ? l.poids_total * prixKg : 0,
  }));

  const totaux = lignes.reduce((acc, l) => ({
    nb_pesees: acc.nb_pesees + l.nb_pesees,
    poids_total: acc.poids_total + l.poids_total,
    montant: acc.montant + l.montant,
  }), { nb_pesees: 0, poids_total: 0, montant: 0 });

  return { prixKg, lignes, totaux };
}

// --- Tableau de bord ---
router.get('/', (req, res) => {
  const periode = req.query.periode || periodeCourante();
  const { prixKg, lignes, totaux } = calculerRecap(periode);
  const nbPlanteursActifs = db.prepare("SELECT COUNT(*) AS n FROM planteurs WHERE statut = 'actif'").get().n;
  res.render('admin/dashboard', {
    adminNom: req.session.adminNom,
    periode, prixKg, lignes, totaux, nbPlanteursActifs,
  });
});

// --- Gestion des planteurs ---
router.get('/planteurs', (req, res) => {
  const q = (req.query.q || '').trim();
  let planteurs;
  if (q) {
    const like = `%${q}%`;
    planteurs = db.prepare(`
      SELECT * FROM planteurs
      WHERE (nom LIKE ? OR prenoms LIKE ? OR identifiant LIKE ?)
      ORDER BY nom, prenoms
    `).all(like, like, like);
  } else {
    planteurs = db.prepare('SELECT * FROM planteurs ORDER BY nom, prenoms').all();
  }
  res.render('admin/planteurs', { adminNom: req.session.adminNom, planteurs, q, message: req.query.message || null });
});

router.get('/planteurs/nouveau', (req, res) => {
  res.render('admin/planteur-form', { adminNom: req.session.adminNom, planteur: null, erreur: null });
});

router.post('/planteurs', async (req, res) => {
  const { nom, prenoms, contact, contact_paiement, moyen_paiement } = req.body;
  if (!nom || !prenoms) {
    return res.render('admin/planteur-form', { adminNom: req.session.adminNom, planteur: req.body, erreur: 'Nom et prenoms sont obligatoires.' });
  }
  const existants = new Set(db.prepare('SELECT identifiant FROM planteurs').all().map((r) => r.identifiant));
  const identifiant = genererIdentifiant(nom, prenoms, existants);
  const motDePasse = genererMotDePasseTemporaire();
  const hash = bcrypt.hashSync(motDePasse, 10);

  db.prepare(`
    INSERT INTO planteurs (nom, prenoms, contact, contact_paiement, moyen_paiement, identifiant, mot_de_passe_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nom, prenoms, contact || null, contact_paiement || null, moyen_paiement || null, identifiant, hash);

  if (contact) {
    await envoyerIdentifiantsParSms(contact, identifiant, motDePasse);
  }

  res.redirect(`/admin/planteurs?message=${encodeURIComponent(`Planteur cree. Identifiant: ${identifiant} / Mot de passe temporaire: ${motDePasse}`)}`);
});

router.get('/planteurs/:id/modifier', (req, res) => {
  const planteur = db.prepare('SELECT * FROM planteurs WHERE id = ?').get(req.params.id);
  if (!planteur) return res.redirect('/admin/planteurs');
  res.render('admin/planteur-form', { adminNom: req.session.adminNom, planteur, erreur: null });
});

router.post('/planteurs/:id', (req, res) => {
  const { nom, prenoms, contact, contact_paiement, moyen_paiement, statut } = req.body;
  db.prepare(`
    UPDATE planteurs
    SET nom = ?, prenoms = ?, contact = ?, contact_paiement = ?, moyen_paiement = ?, statut = ?
    WHERE id = ?
  `).run(nom, prenoms, contact || null, contact_paiement || null, moyen_paiement || null, statut === 'inactif' ? 'inactif' : 'actif', req.params.id);
  res.redirect('/admin/planteurs?message=Planteur mis a jour.');
});

// Suppression logique : on desactive le planteur, l'historique des pesees est conserve
router.post('/planteurs/:id/supprimer', (req, res) => {
  db.prepare("UPDATE planteurs SET statut = 'inactif' WHERE id = ?").run(req.params.id);
  res.redirect('/admin/planteurs?message=Planteur desactive (historique conserve).');
});

router.post('/planteurs/:id/reactiver', (req, res) => {
  db.prepare("UPDATE planteurs SET statut = 'actif' WHERE id = ?").run(req.params.id);
  res.redirect('/admin/planteurs?message=Planteur reactive.');
});

// --- Saisie mensuelle (prix + pesees) ---
router.get('/mois', (req, res) => {
  const periode = req.query.periode || periodeCourante();
  const prixRow = db.prepare('SELECT prix_kg FROM prix_mois WHERE periode = ?').get(periode);
  const planteurs = db.prepare("SELECT * FROM planteurs WHERE statut = 'actif' ORDER BY nom, prenoms").all();
  const pesees = db.prepare(`
    SELECT pz.*, (p.prenoms || ' ' || p.nom) AS nom_complet
    FROM pesees pz JOIN planteurs p ON p.id = pz.planteur_id
    WHERE pz.periode = ?
    ORDER BY pz.date_pesee DESC
  `).all(periode);
  res.render('admin/mois', {
    adminNom: req.session.adminNom,
    periode, prixKg: prixRow ? prixRow.prix_kg : '', planteurs, pesees,
    message: req.query.message || null,
  });
});

router.post('/mois/prix', (req, res) => {
  const { periode, prix_kg } = req.body;
  db.prepare(`
    INSERT INTO prix_mois (periode, prix_kg) VALUES (?, ?)
    ON CONFLICT(periode) DO UPDATE SET prix_kg = excluded.prix_kg
  `).run(periode, parseFloat(prix_kg));
  res.redirect(`/admin/mois?periode=${periode}&message=${encodeURIComponent('Prix du kg enregistre.')}`);
});

router.post('/mois/pesee', (req, res) => {
  const { periode, planteur_id, date_pesee, poids_kg } = req.body;
  const poids = parseFloat(poids_kg);
  if (!planteur_id || !poids || poids <= 0) {
    return res.redirect(`/admin/mois?periode=${periode}&message=${encodeURIComponent('Poids invalide.')}`);
  }
  db.prepare(`
    INSERT INTO pesees (planteur_id, periode, date_pesee, poids_kg) VALUES (?, ?, ?, ?)
  `).run(planteur_id, periode, date_pesee || new Date().toISOString().slice(0, 10), poids);
  res.redirect(`/admin/mois?periode=${periode}&message=${encodeURIComponent('Pesee enregistree.')}`);
});

router.post('/pesees/:id/supprimer', (req, res) => {
  const pesee = db.prepare('SELECT * FROM pesees WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM pesees WHERE id = ?').run(req.params.id);
  res.redirect(`/admin/mois?periode=${pesee ? pesee.periode : ''}&message=${encodeURIComponent('Pesee supprimee.')}`);
});

// --- Recapitulatif mensuel ---
router.get('/recap', (req, res) => {
  const periode = req.query.periode || periodeCourante();
  const { prixKg, lignes, totaux } = calculerRecap(periode);
  res.render('admin/recap', { adminNom: req.session.adminNom, periode, prixKg, lignes, totaux });
});

router.get('/recap/export/excel', async (req, res) => {
  const periode = req.query.periode || periodeCourante();
  const { prixKg, lignes, totaux } = calculerRecap(periode);
  const buffer = await genererExcelRecap(periode, prixKg || 0, lignes, totaux);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="recap-${periode}.xlsx"`);
  res.send(Buffer.from(buffer));
});

router.get('/recap/export/pdf', async (req, res) => {
  const periode = req.query.periode || periodeCourante();
  const { prixKg, lignes, totaux } = calculerRecap(periode);
  const buffer = await genererPdfRecap(periode, prixKg || 0, lignes, totaux);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="recap-${periode}.pdf"`);
  res.send(buffer);
});

// --- Historique des mois ---
router.get('/historique', (req, res) => {
  const periodes = db.prepare('SELECT DISTINCT periode FROM pesees ORDER BY periode DESC').all().map((r) => r.periode);
  res.render('admin/historique', { adminNom: req.session.adminNom, periodes });
});

module.exports = router;
