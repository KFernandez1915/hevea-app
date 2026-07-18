const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { genererCodeReinitialisation } = require('../utils/helpers');
const { envoyerCodeReinitialisationParSms } = require('../utils/sms');

const router = express.Router();

const RESET_CODE_TTL_MS = 15 * 60 * 1000;   // duree de validite du code : 15 minutes
const RESET_MIN_INTERVAL_MS = 60 * 1000;    // delai minimum entre deux demandes : 60 secondes
const RESET_MAX_TENTATIVES = 5;             // nombre d'essais autorises avant blocage du code

// --- Admin ---
router.get('/admin/connexion', (req, res) => {
  res.render('login-admin', { erreur: null });
});

router.post('/admin/connexion', (req, res) => {
  const { identifiant, mot_de_passe } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE identifiant = ?').get(identifiant);
  if (!admin || !bcrypt.compareSync(mot_de_passe || '', admin.mot_de_passe_hash)) {
    return res.render('login-admin', { erreur: 'Identifiant ou mot de passe incorrect.' });
  }
  req.session.adminId = admin.id;
  req.session.adminNom = admin.nom;
  res.redirect('/admin');
});

router.post('/admin/deconnexion', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/connexion'));
});

// --- Planteur ---
router.get('/planteur/connexion', (req, res) => {
  res.render('login-planteur', { erreur: null, message: req.query.message || null });
});

router.post('/planteur/connexion', (req, res) => {
  const { identifiant, mot_de_passe } = req.body;
  const planteur = db.prepare('SELECT * FROM planteurs WHERE identifiant = ? AND statut = ?').get(identifiant, 'actif');
  if (!planteur || !bcrypt.compareSync(mot_de_passe || '', planteur.mot_de_passe_hash)) {
    return res.render('login-planteur', { erreur: 'Identifiant ou mot de passe incorrect.' });
  }
  req.session.planteurId = planteur.id;
  req.session.planteurNom = `${planteur.nom} ${planteur.prenoms}`;
  res.redirect('/planteur');
});

router.post('/planteur/deconnexion', (req, res) => {
  req.session.destroy(() => res.redirect('/planteur/connexion'));
});

// --- Mot de passe oublie (planteur) ---
// Etape 1 : le planteur indique son identifiant. Un code a 6 chiffres est
// genere, hache (jamais stocke en clair) et envoye par SMS au contact
// deja enregistre en base (jamais a un numero fourni par le formulaire,
// pour empecher un tiers de detourner le compte). La reponse est
// volontairement identique que le compte existe ou non, afin de ne pas
// permettre a un attaquant de deviner quels identifiants sont valides.
router.get('/planteur/mot-de-passe-oublie', (req, res) => {
  res.render('planteur/mot-de-passe-oublie', { erreur: null });
});

router.post('/planteur/mot-de-passe-oublie', async (req, res) => {
  const identifiant = (req.body.identifiant || '').trim();

  if (!identifiant) {
    return res.render('planteur/mot-de-passe-oublie', { erreur: 'Veuillez saisir votre identifiant.' });
  }

  const planteur = db.prepare("SELECT * FROM planteurs WHERE identifiant = ? AND statut = 'actif'").get(identifiant);

  if (planteur) {
    const maintenant = Date.now();
    const derniereDemande = planteur.reset_demande_le ? new Date(planteur.reset_demande_le).getTime() : 0;

    if (maintenant - derniereDemande > RESET_MIN_INTERVAL_MS) {
      const code = genererCodeReinitialisation();
      const codeHash = bcrypt.hashSync(code, 10);
      const expireLe = new Date(maintenant + RESET_CODE_TTL_MS).toISOString();

      db.prepare(`
        UPDATE planteurs
        SET reset_code_hash = ?, reset_expire_le = ?, reset_tentatives = 0, reset_demande_le = ?
        WHERE id = ?
      `).run(codeHash, expireLe, new Date(maintenant).toISOString(), planteur.id);

      if (planteur.contact) {
        await envoyerCodeReinitialisationParSms(planteur.contact, code);
      }
    }
    // Si une demande recente existe deja, on ne renvoie pas de nouveau code
    // (protection anti-spam) mais on affiche la meme redirection.
  }

  res.redirect(`/planteur/reinitialiser?identifiant=${encodeURIComponent(identifiant)}`);
});

// Etape 2 : saisie du code recu par SMS + nouveau mot de passe.
router.get('/planteur/reinitialiser', (req, res) => {
  res.render('planteur/reinitialiser', { identifiant: req.query.identifiant || '', erreur: null, message: null });
});

router.post('/planteur/reinitialiser', (req, res) => {
  const identifiant = (req.body.identifiant || '').trim();
  const code = (req.body.code || '').trim();
  const nouveauMotDePasse = req.body.nouveau_mot_de_passe || '';
  const confirmation = req.body.confirmation_mot_de_passe || '';

  const erreurGenerique = 'Code invalide ou expire. Merci de redemander un nouveau code.';

  if (!code || !nouveauMotDePasse || !confirmation) {
    return res.render('planteur/reinitialiser', { identifiant, erreur: 'Veuillez remplir tous les champs.', message: null });
  }
  if (nouveauMotDePasse.length < 6) {
    return res.render('planteur/reinitialiser', { identifiant, erreur: 'Le nouveau mot de passe doit contenir au moins 6 caracteres.', message: null });
  }
  if (nouveauMotDePasse !== confirmation) {
    return res.render('planteur/reinitialiser', { identifiant, erreur: 'Les deux mots de passe ne correspondent pas.', message: null });
  }

  const planteur = db.prepare("SELECT * FROM planteurs WHERE identifiant = ? AND statut = 'actif'").get(identifiant);

  if (!planteur || !planteur.reset_code_hash || !planteur.reset_expire_le) {
    return res.render('planteur/reinitialiser', { identifiant, erreur: erreurGenerique, message: null });
  }
  if (new Date(planteur.reset_expire_le).getTime() < Date.now()) {
    db.prepare('UPDATE planteurs SET reset_code_hash = NULL, reset_expire_le = NULL WHERE id = ?').run(planteur.id);
    return res.render('planteur/reinitialiser', { identifiant, erreur: erreurGenerique, message: null });
  }
  if (planteur.reset_tentatives >= RESET_MAX_TENTATIVES) {
    db.prepare('UPDATE planteurs SET reset_code_hash = NULL, reset_expire_le = NULL WHERE id = ?').run(planteur.id);
    return res.render('planteur/reinitialiser', { identifiant, erreur: 'Trop de tentatives. Merci de redemander un nouveau code.', message: null });
  }

  if (!bcrypt.compareSync(code, planteur.reset_code_hash)) {
    db.prepare('UPDATE planteurs SET reset_tentatives = reset_tentatives + 1 WHERE id = ?').run(planteur.id);
    return res.render('planteur/reinitialiser', { identifiant, erreur: erreurGenerique, message: null });
  }

  // Code valide : on met a jour le mot de passe et on invalide immediatement le code
  // (usage unique) pour qu'il ne puisse pas etre rejoue.
  const nouveauHash = bcrypt.hashSync(nouveauMotDePasse, 10);
  db.prepare(`
    UPDATE planteurs
    SET mot_de_passe_hash = ?, mot_de_passe_temporaire = 0,
        reset_code_hash = NULL, reset_expire_le = NULL, reset_tentatives = 0, reset_demande_le = NULL
    WHERE id = ?
  `).run(nouveauHash, planteur.id);

  res.redirect('/planteur/connexion?message=' + encodeURIComponent('Mot de passe reinitialise. Vous pouvez vous connecter.'));
});

module.exports = router;
