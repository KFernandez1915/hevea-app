require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

require('./db'); // initialise la base de donnees et le compte admin par defaut
const { formaterMontant, formaterPeriode } = require('./utils/helpers');
const { csrfToken, csrfProtection } = require('./middleware/csrf');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const planteurRoutes = require('./routes/planteur');

const app = express();
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.locals.formaterMontant = formaterMontant;
app.locals.formaterPeriode = formaterPeriode;

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET doit etre defini en production (voir .env.example).');
}

app.use(session({
  name: 'hevea.sid',
  secret: process.env.SESSION_SECRET || 'change-moi-en-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 8, // 8h
  },
}));

app.use(csrfToken);
app.use(csrfProtection);

app.get('/', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  if (req.session.planteurId) return res.redirect('/planteur');
  res.render('accueil');
});

app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/planteur', planteurRoutes);

app.use((req, res) => {
  res.status(404).send('Page introuvable.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[hevea-app] Serveur demarre sur http://localhost:${PORT}`);
});
app.get('/test-session', (req, res) => {
  req.session.test = 'OK';

  req.session.save((err) => {
    if (err) {
      console.error('ERREUR SESSION:', err);
      return res.status(500).send('Erreur session');
    }

    res.send(`
      <h1>Test session</h1>
      <p>Session ID : ${req.sessionID}</p>
      <p>Valeur enregistrée : ${req.session.test}</p>
      <a href="/test-session-verification">Vérifier la session</a>
    `);
  });
});

app.get('/test-session-verification', (req, res) => {
  res.send(`
    <h1>Vérification</h1>
    <p>Session ID : ${req.sessionID}</p>
    <p>Valeur : ${req.session.test || 'SESSION PERDUE'}</p>
  `);
});
// Route spéciale pour garder le serveur éveillé
app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});
