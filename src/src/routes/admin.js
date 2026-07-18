const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { exigerAdmin } = require('../middleware/auth');
const { genererMotDePasseTemporaire, genererIdentifiant, periodeCourante } = require('../utils/helpers');
const { envoyerIdentifiantsParSms } = require('../utils/sms');
const { genererExcelRecap, genererPdfRecap } = require('../utils/export');
const { uploadInformation, typeMediaDepuisMime, UPLOAD_DIR } = require('../utils/upload');

const router = express.Router();
router.use(exigerAdmin);

function calculerRecap(periode) {
  const prixRow = db.prepare('SELECT prix_kg FROM prix_mois WHERE periode = ?').get(periode);
  const prixKg = prixRow ? prixRow.prix_kg : null;

  const lignes = db.prepare(`
    SELECT p.id AS planteur_id,
           (p.nom || ' ' || p.prenoms) AS nom_complet,
           p.contact AS contact,
           COUNT(pz.id) AS nb_pesees,
           COALESCE(SUM(pz.poids_kg), 0) AS poids_total
    FROM planteurs p
    JOIN pesees pz ON pz.planteur_id = p.id AND pz.periode = ?
    WHERE p.statut = 'actif' AND p.supprime = 0
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
  const nbPlanteursActifs = db.prepare("SELECT COUNT(*) AS n FROM planteurs WHERE statut = 'actif' AND supprime = 0").get().n;
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
      WHERE supprime = 0 AND (nom LIKE ? OR prenoms LIKE ? OR identifiant LIKE ?)
      ORDER BY nom, prenoms
    `).all(like, like, like);
  } else {
    planteurs = db.prepare('SELECT * FROM planteurs WHERE supprime = 0 ORDER BY nom, prenoms').all();
  }
  const nbCorbeille = db.prepare('SELECT COUNT(*) AS n FROM planteurs WHERE supprime = 1').get().n;
  res.render('admin/planteurs', { adminNom: req.session.adminNom, planteurs, q, nbCorbeille, message: req.query.message || null });
});

// --- Corbeille des planteurs supprimes ---
router.get('/planteurs/corbeille', (req, res) => {
  const planteurs = db.prepare('SELECT * FROM planteurs WHERE supprime = 1 ORDER BY supprime_le DESC').all();
  res.render('admin/corbeille', { adminNom: req.session.adminNom, planteurs, message: req.query.message || null });
});

router.post('/planteurs/:id/restaurer', (req, res) => {
  db.prepare("UPDATE planteurs SET supprime = 0, supprime_le = NULL WHERE id = ?").run(req.params.id);
  res.redirect('/admin/planteurs/corbeille?message=' + encodeURIComponent('Planteur restaure.'));
});

router.post('/planteurs/:id/supprimer-definitivement', (req, res) => {
  db.prepare('DELETE FROM planteurs WHERE id = ?').run(req.params.id);
  res.redirect('/admin/planteurs/corbeille?message=' + encodeURIComponent('Planteur supprime definitivement.'));
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

// Suppression : le planteur est envoye dans la corbeille (il disparait de la liste
// mais son historique des pesees est conserve ; il peut etre restaure ou supprime
// definitivement depuis la corbeille).
router.post('/planteurs/:id/supprimer', (req, res) => {
  db.prepare("UPDATE planteurs SET supprime = 1, supprime_le = datetime('now') WHERE id = ?").run(req.params.id);
  res.redirect('/admin/planteurs?message=' + encodeURIComponent('Planteur deplace dans la corbeille.'));
});

router.post('/planteurs/:id/reactiver', (req, res) => {
  db.prepare("UPDATE planteurs SET statut = 'actif' WHERE id = ?").run(req.params.id);
  res.redirect('/admin/planteurs?message=Planteur reactive.');
});

// --- Saisie mensuelle (prix + pesees) ---
router.get('/mois', (req, res) => {
  const periode = req.query.periode || periodeCourante();
  const prixRow = db.prepare('SELECT prix_kg FROM prix_mois WHERE periode = ?').get(periode);
  const planteurs = db.prepare("SELECT * FROM planteurs WHERE statut = 'actif' AND supprime = 0 ORDER BY nom, prenoms").all();
  const pesees = db.prepare(`
    SELECT pz.*, (p.nom || ' ' || p.prenoms) AS nom_complet
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

// --- Informations (annonces, avec image / video / audio en piece jointe) ---
router.get('/informations', (req, res) => {
  const informations = db.prepare('SELECT * FROM informations ORDER BY cree_le DESC').all();
  res.render('admin/informations', { adminNom: req.session.adminNom, informations, erreur: req.query.erreur || null, message: req.query.message || null });
});

router.post('/informations', (req, res) => {
  uploadInformation.single('media')(req, res, (err) => {
    if (err) {
      return res.redirect('/admin/informations?erreur=' + encodeURIComponent(err.message));
    }
    const contenu = (req.body.contenu || '').trim();
    if (!contenu) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.redirect('/admin/informations?erreur=' + encodeURIComponent('Le texte de l\'information est obligatoire.'));
    }
    const typeMedia = req.file ? typeMediaDepuisMime(req.file.mimetype) : null;
    const fichier = req.file ? req.file.filename : null;

    db.prepare(`
      INSERT INTO informations (contenu, type_media, fichier, auteur)
      VALUES (?, ?, ?, ?)
    `).run(contenu, typeMedia, fichier, req.session.adminNom || 'Administrateur');

    res.redirect('/admin/informations?message=' + encodeURIComponent('Information publiee.'));
  });
});

router.post('/informations/:id/supprimer', (req, res) => {
  const info = db.prepare('SELECT * FROM informations WHERE id = ?').get(req.params.id);
  if (info) {
    if (info.fichier) {
      const fichierChemin = path.join(UPLOAD_DIR, info.fichier);
      if (fs.existsSync(fichierChemin)) fs.unlinkSync(fichierChemin);
    }
    db.prepare('DELETE FROM informations WHERE id = ?').run(req.params.id);
  }
  res.redirect('/admin/informations?message=' + encodeURIComponent('Information supprimee.'));
});

module.exports = router;
