const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

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
  res.render('login-planteur', { erreur: null });
});

router.post('/planteur/connexion', (req, res) => {
  const { identifiant, mot_de_passe } = req.body;
  const planteur = db.prepare('SELECT * FROM planteurs WHERE identifiant = ? AND statut = ?').get(identifiant, 'actif');
  if (!planteur || !bcrypt.compareSync(mot_de_passe || '', planteur.mot_de_passe_hash)) {
    return res.render('login-planteur', { erreur: 'Identifiant ou mot de passe incorrect.' });
  }
  req.session.planteurId = planteur.id;
  req.session.planteurNom = `${planteur.prenoms} ${planteur.nom}`;
  res.redirect('/planteur');
});

router.post('/planteur/deconnexion', (req, res) => {
  req.session.destroy(() => res.redirect('/planteur/connexion'));
});

module.exports = router;
