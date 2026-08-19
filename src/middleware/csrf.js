const crypto = require('crypto');

// Protection CSRF (synchronizer token pattern) basee sur la session existante,
// sans dependance supplementaire. Un jeton est genere par session et expose
// aux vues via res.locals.csrfToken ; chaque formulaire POST/PUT/DELETE doit
// le renvoyer dans un champ cache "_csrf".

function csrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifieToken(req) {
  const fourni = req.body && req.body._csrf;
  return !!fourni && !!req.session.csrfToken
    && fourni.length === req.session.csrfToken.length
    && crypto.timingSafeEqual(Buffer.from(fourni), Buffer.from(req.session.csrfToken));
}

// Middleware pour les routes classiques (formulaires urlencoded).
// Les routes multipart/form-data (upload de fichiers) parsent leur corps
// elles-memes via multer : elles doivent appeler verifieToken(req) manuellement
// une fois req.body disponible, plutot que d'utiliser ce middleware.
function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.is('multipart/form-data')) return next(); // verifie manuellement dans la route
  if (!verifieToken(req)) {
    return res.status(403).send('Session invalide ou expiree. Veuillez recharger la page et reessayer.');
  }
  next();
}

module.exports = { csrfToken, csrfProtection, verifieToken };
