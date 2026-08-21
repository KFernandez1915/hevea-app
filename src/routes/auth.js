const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { genererMotDePasseTemporaireSecurise } = require('../utils/helpers');
const { limiterParIp } = require('../utils/rateLimit');
const { validateBody } = require('../middleware/validation');

const router = express.Router();

const MDP_TEMP_TTL_MS = 15 * 60 * 1000;     // duree de validite du mot de passe temporaire pour se connecter : 15 minutes
const RESET_MIN_INTERVAL_MS = 30 * 1000;    // delai minimum entre deux demandes reussies : 30 secondes
const RESET_MAX_TENTATIVES = 5;             // essais infructueux avant verrouillage temporaire du compte
const RESET_LOCKOUT_MS = 15 * 60 * 1000;    // duree du verrouillage apres trop d'essais infructueux

// --- Admin ---
router.get('/admin/connexion', (req, res) => {
  res.render('login-admin', { erreur: null });
});

router.post('/admin/connexion', validateBody('auth'), (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const { bloque } = limiterParIp('admin-connexion', ip, 10, 15 * 60 * 1000);
  if (bloque) return res.status(429).render('login-admin', { erreur: 'Trop de tentatives. Merci de réessayer plus tard.' });
  const { identifiant, mot_de_passe } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE identifiant = ?').get(identifiant);
  if (!admin || !bcrypt.compareSync(mot_de_passe || '', admin.mot_de_passe_hash)) {
    return res.render('login-admin', { erreur: 'Identifiant ou mot de passe incorrect.' });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).send('Impossible de créer la session.');
    req.session.adminId = admin.id;
    req.session.adminNom = admin.nom;
    req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
    req.session.save(() => res.redirect('/admin'));
  });
});

router.post('/admin/deconnexion', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/connexion'));
});

// --- Planteur ---
router.get('/planteur/connexion', (req, res) => {
  res.render('login-planteur', { erreur: req.query.erreur || null, message: req.query.message || null });
});

router.post('/planteur/connexion', validateBody('auth'), (req, res) => {
  const { identifiant, mot_de_passe } = req.body;
  const MESSAGE_COMPTE_BLOQUE = 'Votre session est inactive, veuillez contacter l\'administrateur.';

  const planteur = db.prepare('SELECT * FROM planteurs WHERE identifiant = ?').get(identifiant);
  if (!planteur || !bcrypt.compareSync(mot_de_passe || '', planteur.mot_de_passe_hash)) {
    return res.render('login-planteur', { erreur: 'Identifiant ou mot de passe incorrect.' });
  }
  // Le compte existe et le mot de passe est correct, mais le planteur a ete
  // supprime (deplace vers la corbeille) entre-temps : on l'informe clairement
  // au lieu d'un message generique qui laisserait croire a une erreur de saisie.
  if (planteur.statut !== 'actif') {
    return res.render('login-planteur', { erreur: MESSAGE_COMPTE_BLOQUE });
  }
  // Un mot de passe temporaire (genere via "mot de passe oublie") n'est valable
  // que pendant une duree limitee : au-dela, meme s'il est correct, on refuse
  // la connexion et on invite a en redemander un nouveau.
  if (planteur.mot_de_passe_temporaire && planteur.mdp_temp_expire_le) {
    if (new Date(planteur.mdp_temp_expire_le).getTime() < Date.now()) {
      return res.render('login-planteur', { erreur: 'Ce mot de passe temporaire a expire. Merci d\'en redemander un nouveau.' });
    }
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).send('Impossible de créer la session.');
    req.session.planteurId = planteur.id;
    req.session.planteurNom = `${planteur.nom} ${planteur.prenoms}`;
    req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');
    req.session.save(() => res.redirect('/planteur'));
  });
});

router.post('/planteur/deconnexion', (req, res) => {
  req.session.destroy(() => res.redirect('/planteur/connexion'));
});

// --- Mot de passe oublie (planteur) ---
// Le planteur s'identifie avec son identifiant ET le numero de telephone deja
// enregistre sur son compte (connu uniquement de lui et de l'association) :
// c'est la verification qui remplace l'envoi d'un code par SMS. En cas de
// correspondance, un mot de passe temporaire est genere cote serveur et
// affiche UNE SEULE FOIS a l'ecran (jamais stocke en clair, jamais transmis
// par un autre canal) : le planteur doit le noter immediatement, il n'est
// visible que 30 secondes puis se masque automatiquement. Ce mot de passe
// n'est valable que 15 minutes pour se connecter, et un changement definitif
// est exige des la premiere connexion.
router.get('/planteur/mot-de-passe-oublie', (req, res) => {
  res.render('planteur/mot-de-passe-oublie', { erreur: null });
});

router.post('/planteur/mot-de-passe-oublie', validateBody('passwordReset'), (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const { bloque } = limiterParIp('mdp-oublie', ip, 20, 15 * 60 * 1000);
  if (bloque) {
    return res.render('planteur/mot-de-passe-oublie', {
      erreur: 'Trop de tentatives depuis cet appareil. Merci de reessayer dans quelques minutes.',
    });
  }

  const identifiant = (req.body.identifiant || '').trim();
  const telephoneSaisi = (req.body.telephone || '').replace(/\D/g, '');
  const erreurGenerique = 'Identifiant ou numero de telephone incorrect.';

  if (!identifiant || !telephoneSaisi) {
    return res.render('planteur/mot-de-passe-oublie', { erreur: 'Veuillez remplir tous les champs.' });
  }

  const planteur = db.prepare("SELECT * FROM planteurs WHERE identifiant = ? AND statut = 'actif'").get(identifiant);
  const maintenant = Date.now();

  // Verrouillage temporaire du compte apres trop d'essais infructueux.
  if (planteur && planteur.reset_tentatives >= RESET_MAX_TENTATIVES && planteur.reset_demande_le) {
    const depuisDernierEchec = maintenant - new Date(planteur.reset_demande_le).getTime();
    if (depuisDernierEchec < RESET_LOCKOUT_MS) {
      return res.render('planteur/mot-de-passe-oublie', { erreur: erreurGenerique });
    }
    // Le verrou expire : on remet le compteur a zero pour retenter la verification.
    db.prepare('UPDATE planteurs SET reset_tentatives = 0 WHERE id = ?').run(planteur.id);
    planteur.reset_tentatives = 0;
  }

  const telephoneEnregistre = planteur && planteur.contact ? planteur.contact.replace(/\D/g, '') : null;
  const correspond = planteur && telephoneEnregistre && telephoneEnregistre.length >= 6 && telephoneEnregistre === telephoneSaisi;

  if (!correspond) {
    if (planteur) {
      db.prepare('UPDATE planteurs SET reset_tentatives = reset_tentatives + 1, reset_demande_le = ? WHERE id = ?')
        .run(new Date(maintenant).toISOString(), planteur.id);
    }
    return res.render('planteur/mot-de-passe-oublie', { erreur: erreurGenerique });
  }

  // Anti-spam : eviter de regenerer un mot de passe a chaque clic repete.
  const derniereReussite = planteur.reset_demande_le ? new Date(planteur.reset_demande_le).getTime() : 0;
  if (planteur.reset_tentatives === 0 && maintenant - derniereReussite < RESET_MIN_INTERVAL_MS) {
    return res.render('planteur/mot-de-passe-oublie', {
      erreur: 'Une demande vient deja d\'etre traitee. Merci de patienter quelques secondes avant de reessayer.',
    });
  }

  const motDePasseTemporaire = genererMotDePasseTemporaireSecurise();
  const hash = bcrypt.hashSync(motDePasseTemporaire, 10);
  const expireLe = new Date(maintenant + MDP_TEMP_TTL_MS).toISOString();

  db.prepare(`
    UPDATE planteurs
    SET mot_de_passe_hash = ?, mot_de_passe_temporaire = 1, mdp_temp_expire_le = ?,
        reset_tentatives = 0, reset_demande_le = ?
    WHERE id = ?
  `).run(hash, expireLe, new Date(maintenant).toISOString(), planteur.id);

  res.render('planteur/mot-de-passe-genere', {
    identifiant: planteur.identifiant,
    motDePasseTemporaire,
    dureeAffichageSecondes: 30,
    dureeValiditeMinutes: 15,
  });
});

module.exports = router;
