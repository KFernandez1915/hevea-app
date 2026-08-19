const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { exigerAdmin } = require('../middleware/auth');
const { genererMotDePasseTemporaire, genererIdentifiant, periodeCourante, formaterPeriode } = require('../utils/helpers');
const { envoyerIdentifiantsParSms } = require('../utils/sms');
const { genererExcelRecap, genererExcelRecapSimplifie, genererExcelRecapNomPoids, genererPdfRecap, genererExcelHistorique, genererPdfHistorique } = require('../utils/export');
const { upload, typeDepuisMime, UPLOAD_DIR } = require('../utils/upload');
const { recupererActualites, etatSources } = require('../utils/actualites');
const { verifieToken } = require('../middleware/csrf');

const router = express.Router();
router.use(exigerAdmin);

function calculerRecap(periode) {
  const prixRow = db.prepare('SELECT prix_kg FROM prix_mois WHERE periode = ?').get(periode);
  const prixKg = prixRow ? prixRow.prix_kg : null;

  const lignes = db.prepare(`
    SELECT p.id AS planteur_id,
           (p.nom || ' ' || p.prenoms) AS nom_complet,
           p.contact AS contact,
           p.contact_paiement AS contact_paiement,
           p.moyen_paiement AS moyen_paiement,
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

  // Toutes les pesees de tous les planteurs actifs, chronologiquement, pour
  // tracer le graphique d'evolution du poids a chaque pesee.
  const toutesLesPesees = db.prepare(`
    SELECT pz.date_pesee, pz.poids_kg, (p.nom || ' ' || p.prenoms) AS nom_complet
    FROM pesees pz
    JOIN planteurs p ON p.id = pz.planteur_id
    WHERE p.statut = 'actif'
    ORDER BY pz.date_pesee ASC, pz.id ASC
  `).all();

  res.render('admin/dashboard', {
    adminNom: req.session.adminNom,
    periode, prixKg, lignes, totaux, nbPlanteursActifs, toutesLesPesees,
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
      WHERE statut = 'actif' AND (nom LIKE ? OR prenoms LIKE ? OR identifiant LIKE ?)
      ORDER BY nom, prenoms
    `).all(like, like, like);
  } else {
    planteurs = db.prepare("SELECT * FROM planteurs WHERE statut = 'actif' ORDER BY nom, prenoms").all();
  }
  const { n: nbCorbeille } = db.prepare("SELECT COUNT(*) AS n FROM planteurs WHERE statut = 'inactif'").get();
  res.render('admin/planteurs', { adminNom: req.session.adminNom, planteurs, q, message: req.query.message || null, nbCorbeille });
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
  const { nom, prenoms, contact, contact_paiement, moyen_paiement } = req.body;
  db.prepare(`
    UPDATE planteurs
    SET nom = ?, prenoms = ?, contact = ?, contact_paiement = ?, moyen_paiement = ?
    WHERE id = ?
  `).run(nom, prenoms, contact || null, contact_paiement || null, moyen_paiement || null, req.params.id);
  res.redirect('/admin/planteurs?message=Planteur mis a jour.');
});

// Suppression logique : le planteur est deplace vers la corbeille (statut
// inactif + horodatage) et disparait de la liste principale. L'historique
// des pesees est conserve, la reactivation reste possible depuis la corbeille.
router.post('/planteurs/:id/supprimer', (req, res) => {
  db.prepare("UPDATE planteurs SET statut = 'inactif', supprime_le = ? WHERE id = ?").run(new Date().toISOString(), req.params.id);
  res.redirect('/admin/planteurs?message=Planteur deplace vers la corbeille.');
});

router.post('/planteurs/:id/reactiver', (req, res) => {
  db.prepare("UPDATE planteurs SET statut = 'actif', supprime_le = NULL WHERE id = ?").run(req.params.id);
  res.redirect('/admin/corbeille?message=Planteur restaure.');
});

// --- Corbeille (planteurs supprimes) ---
router.get('/corbeille', (req, res) => {
  const planteurs = db.prepare("SELECT * FROM planteurs WHERE statut = 'inactif' ORDER BY supprime_le DESC").all();
  res.render('admin/corbeille', { adminNom: req.session.adminNom, planteurs, message: req.query.message || null, erreur: req.query.erreur || null });
});

// Suppression definitive : uniquement possible depuis la corbeille, et
// uniquement si le planteur n'a aucune pesee enregistree (pour ne jamais
// perdre un historique de paiement reel). Sinon on bloque avec un message clair.
router.post('/planteurs/:id/supprimer-definitivement', (req, res) => {
  const planteur = db.prepare('SELECT * FROM planteurs WHERE id = ?').get(req.params.id);
  if (!planteur || planteur.statut !== 'inactif') {
    return res.redirect('/admin/corbeille?erreur=' + encodeURIComponent('Ce planteur doit dabord etre dans la corbeille.'));
  }
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM pesees WHERE planteur_id = ?').get(req.params.id);
  if (n > 0) {
    return res.redirect('/admin/corbeille?erreur=' + encodeURIComponent('Suppression definitive impossible : ce planteur a un historique de pesees.'));
  }
  db.prepare('DELETE FROM planteurs WHERE id = ?').run(req.params.id);
  res.redirect('/admin/corbeille?message=' + encodeURIComponent('Planteur supprime definitivement.'));
});

// --- Saisie mensuelle (prix + pesees) ---
router.get('/mois', (req, res) => {
  const periode = req.query.periode || periodeCourante();
  const prixRow = db.prepare('SELECT prix_kg FROM prix_mois WHERE periode = ?').get(periode);
  const planteurs = db.prepare("SELECT * FROM planteurs WHERE statut = 'actif' ORDER BY nom, prenoms").all();
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
  res.redirect(`/admin/mois?periode=${encodeURIComponent(periode)}&message=${encodeURIComponent('Prix du kg enregistre.')}`);
});

router.post('/mois/pesee', (req, res) => {
  const { periode, planteur_id, date_pesee, poids_kg } = req.body;
  const poids = parseFloat(poids_kg);
  if (!planteur_id || !poids || poids <= 0) {
    return res.redirect(`/admin/mois?periode=${encodeURIComponent(periode)}&message=${encodeURIComponent('Poids invalide.')}`);
  }
  db.prepare(`
    INSERT INTO pesees (planteur_id, periode, date_pesee, poids_kg) VALUES (?, ?, ?, ?)
  `).run(planteur_id, periode, date_pesee || new Date().toISOString().slice(0, 10), poids);
  res.redirect(`/admin/mois?periode=${encodeURIComponent(periode)}&message=${encodeURIComponent('Pesee enregistree.')}`);
});

router.post('/pesees/:id/supprimer', (req, res) => {
  const pesee = db.prepare('SELECT * FROM pesees WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM pesees WHERE id = ?').run(req.params.id);
  res.redirect(`/admin/mois?periode=${encodeURIComponent(pesee ? pesee.periode : '')}&message=${encodeURIComponent('Pesee supprimee.')}`);
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

router.get('/recap/export/excel-simplifie', async (req, res) => {
  const periode = req.query.periode || periodeCourante();
  const { lignes } = calculerRecap(periode);
  const buffer = await genererExcelRecapSimplifie(periode, lignes);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="contacts-planteurs-${periode}.xlsx"`);
  res.send(Buffer.from(buffer));
});

router.get('/recap/export/excel-nom-poids', async (req, res) => {
  const periode = req.query.periode || periodeCourante();
  const { prixKg, lignes } = calculerRecap(periode);
  const buffer = await genererExcelRecapNomPoids(periode, prixKg || 0, lignes);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="noms-poids-planteurs-${periode}.xlsx"`);
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
function construireHistorique() {
  const periodes = db.prepare('SELECT DISTINCT periode FROM pesees ORDER BY periode DESC').all().map((r) => r.periode);

  const lignesHistorique = periodes.map((periode) => {
    const { prixKg, lignes, totaux } = calculerRecap(periode);
    return {
      periode,
      libellePeriode: formaterPeriode(periode),
      prixKg,
      nbPlanteurs: lignes.length,
      nbPesees: totaux.nb_pesees,
      poidsTotal: totaux.poids_total,
      montantTotal: totaux.montant,
    };
  });

  const totauxGeneraux = lignesHistorique.reduce((acc, l) => ({
    nbPesees: acc.nbPesees + l.nbPesees,
    poidsTotal: acc.poidsTotal + l.poidsTotal,
    montantTotal: acc.montantTotal + l.montantTotal,
  }), { nbPesees: 0, poidsTotal: 0, montantTotal: 0 });

  return { periodes, lignesHistorique, totauxGeneraux };
}

router.get('/historique', (req, res) => {
  const { periodes, lignesHistorique, totauxGeneraux } = construireHistorique();
  res.render('admin/historique', { adminNom: req.session.adminNom, periodes, lignesHistorique, totauxGeneraux });
});

router.get('/historique/export/excel', async (req, res) => {
  const { lignesHistorique, totauxGeneraux } = construireHistorique();
  const buffer = await genererExcelHistorique(lignesHistorique, totauxGeneraux);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="historique-hevea.xlsx"');
  res.send(Buffer.from(buffer));
});

router.get('/historique/export/pdf', async (req, res) => {
  const { lignesHistorique, totauxGeneraux } = construireHistorique();
  const buffer = await genererPdfHistorique(lignesHistorique, totauxGeneraux);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="historique-hevea.pdf"');
  res.send(buffer);
});

// --- Informations (annonces avec texte + image/video/audio) ---
router.get('/informations', (req, res) => {
  const informations = db.prepare('SELECT * FROM informations ORDER BY cree_le DESC').all();
  res.render('admin/informations', {
    adminNom: req.session.adminNom,
    informations,
    message: req.query.message || null,
    erreur: req.query.erreur || null,
  });
});

router.post('/informations', (req, res, next) => {
  upload.single('fichier')(req, res, (err) => {
    if (err) {
      return res.redirect(`/admin/informations?erreur=${encodeURIComponent(err.message)}`);
    }
    // Le middleware CSRF global ignore les requetes multipart/form-data (le
    // corps n'est pas encore parse a ce stade-la) : on verifie donc le jeton
    // manuellement ici, une fois que multer l'a extrait dans req.body.
    if (!verifieToken(req)) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(403).send('Session invalide ou expiree. Veuillez recharger la page et reessayer.');
    }
    next();
  });
}, (req, res) => {
  const { titre, contenu } = req.body;
  if (!titre || !titre.trim()) {
    return res.redirect(`/admin/informations?erreur=${encodeURIComponent('Le titre est obligatoire.')}`);
  }
  const fichier = req.file;
  const fichierType = fichier ? typeDepuisMime(fichier.mimetype) : null;

  db.prepare(`
    INSERT INTO informations (titre, contenu, fichier_nom, fichier_type, fichier_mime)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    titre.trim(),
    contenu ? contenu.trim() : null,
    fichier ? fichier.filename : null,
    fichierType,
    fichier ? fichier.mimetype : null
  );

  res.redirect(`/admin/informations?message=${encodeURIComponent('Information publiee.')}`);
});

router.post('/informations/:id/supprimer', (req, res) => {
  const info = db.prepare('SELECT * FROM informations WHERE id = ?').get(req.params.id);
  if (info && info.fichier_nom) {
    // path.basename() retire tout segment ../ ou / avant la jointure, pour
    // empecher une traversee de repertoire meme si fichier_nom etait corrompu.
    const nomSecurise = path.basename(info.fichier_nom);
    const filePath = path.join(UPLOAD_DIR, nomSecurise);
    if (filePath.startsWith(UPLOAD_DIR)) {
      fs.unlink(filePath, () => {});
    }
  }
  db.prepare('DELETE FROM informations WHERE id = ?').run(req.params.id);
  res.redirect(`/admin/informations?message=${encodeURIComponent('Information supprimee.')}`);
});

// --- Actualites hevea (RSS + publications manuelles) ---
router.get('/actualites', async (req, res) => {
  let actualites = [];
  let erreurChargement = null;
  try {
    actualites = await recupererActualites({ forcerRafraichissement: req.query.rafraichir === '1' });
  } catch (err) {
    erreurChargement = 'Impossible de recuperer les actualites pour le moment.';
  }
  const sources = etatSources();
  res.render('admin/actualites', {
    adminNom: req.session.adminNom,
    actualites,
    sources,
    erreurChargement,
    message: req.query.message || null,
    erreur: req.query.erreur || null,
  });
});

router.post('/actualites/sources', (req, res) => {
  const { nom, url } = req.body;
  if (!nom || !nom.trim() || !url || !url.trim()) {
    return res.redirect('/admin/actualites?erreur=' + encodeURIComponent('Le nom et l\'URL du flux sont obligatoires.'));
  }
  let urlValide;
  try {
    urlValide = new URL(url.trim());
    if (!['http:', 'https:'].includes(urlValide.protocol)) throw new Error('protocole invalide');
  } catch {
    return res.redirect('/admin/actualites?erreur=' + encodeURIComponent('URL de flux invalide.'));
  }
  db.prepare('INSERT INTO actualites_sources (nom, url) VALUES (?, ?)').run(nom.trim(), urlValide.toString());
  res.redirect('/admin/actualites?message=' + encodeURIComponent('Source ajoutee.'));
});

router.post('/actualites/sources/:id/toggle', (req, res) => {
  const source = db.prepare('SELECT * FROM actualites_sources WHERE id = ?').get(req.params.id);
  if (source) {
    db.prepare('UPDATE actualites_sources SET actif = ? WHERE id = ?').run(source.actif ? 0 : 1, source.id);
  }
  res.redirect('/admin/actualites');
});

router.post('/actualites/sources/:id/supprimer', (req, res) => {
  db.prepare('DELETE FROM actualites_sources WHERE id = ?').run(req.params.id);
  res.redirect('/admin/actualites?message=' + encodeURIComponent('Source supprimee.'));
});

router.post('/actualites/manuelles', (req, res) => {
  const { titre, resume, lien } = req.body;
  if (!titre || !titre.trim()) {
    return res.redirect('/admin/actualites?erreur=' + encodeURIComponent('Le titre est obligatoire.'));
  }
  let lienValide = null;
  if (lien && lien.trim()) {
    try {
      const u = new URL(lien.trim());
      if (['http:', 'https:'].includes(u.protocol)) lienValide = u.toString();
    } catch {
      return res.redirect('/admin/actualites?erreur=' + encodeURIComponent('Lien invalide.'));
    }
  }
  db.prepare('INSERT INTO actualites_manuelles (titre, resume, lien) VALUES (?, ?, ?)')
    .run(titre.trim(), resume ? resume.trim() : null, lienValide);
  res.redirect('/admin/actualites?message=' + encodeURIComponent('Actualite publiee.'));
});

router.post('/actualites/manuelles/:id/supprimer', (req, res) => {
  db.prepare('DELETE FROM actualites_manuelles WHERE id = ?').run(req.params.id);
  res.redirect('/admin/actualites?message=' + encodeURIComponent('Actualite supprimee.'));
});

module.exports = router;
