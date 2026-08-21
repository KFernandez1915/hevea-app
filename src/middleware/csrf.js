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
  // Schéma minimal explicite de la requête CSRF :
  // le corps doit être un objet et _csrf, lorsqu'il est présent, doit être
  // une chaîne hexadécimale de 64 caractères. La validation métier complète
  // du body est effectuée par validateBody(schema) sur chaque route.
  const body = req.body;
  if (body !== undefined && (body === null || typeof body !== 'object' || Array.isArray(body))) {
    return false;
  }
  const fourni = body && Object.hasOwn(body, '_csrf') ? body._csrf : undefined;
  const attendu = req.session && req.session.csrfToken;
  if (typeof fourni !== 'string' || typeof attendu !== 'string') return false;
  if (fourni.length !== attendu.length || fourni.length !== 64) return false;
  if (!/^[a-f0-9]{64}$/i.test(fourni) || !/^[a-f0-9]{64}$/i.test(attendu)) return false;
  return crypto.timingSafeEqual(Buffer.from(fourni, 'utf8'), Buffer.from(attendu, 'utf8'));
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
