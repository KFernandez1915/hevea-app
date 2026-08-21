require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

require('./db'); // initialise la base de donnees et le compte admin par defaut
const { formaterMontant, formaterPeriode } = require('./utils/helpers');
const { csrfToken, csrfProtection } = require('./middleware/csrf');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const planteurRoutes = require('./routes/planteur');

const app = express();

// Render (comme la plupart des reverse proxies) termine HTTPS en amont
// et transmet la requete HTTP au processus Node. Cela doit etre declare
// a Express pour que les cookies de session `secure` fonctionnent correctement.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.locals.formaterMontant = formaterMontant;
app.locals.formaterPeriode = formaterPeriode;

app.use(express.urlencoded({ extended: true, limit: '100kb' }));
// En-têtes de sécurité sans imposer de politique CSP qui pourrait modifier le rendu
// ou les scripts existants de l'application.
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});
app.use(express.static(path.join(__dirname, '..', 'public')));

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET doit etre defini en production (voir .env.example).');
}

const sessionCookieMaxAge = 1000 * 60 * 60 * 8;

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
    domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
    expires: null,
    maxAge: sessionCookieMaxAge, // 8h
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
// Route spéciale pour garder le serveur éveillé
app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});
