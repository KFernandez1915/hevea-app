const MAX = Object.freeze({
  short: 100,
  name: 120,
  phone: 30,
  text: 5000,
  url: 2048,
});

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CSRF_RE = /^[a-f0-9]{64}$/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
     Object.getPrototypeOf(value) === null);
}

function hasOwn(object, key) {
  return Object.hasOwn(object, key);
}

function stringField(value, options) {
  const { required = false, max = MAX.text, pattern } = options || {};
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('Champ obligatoire.');
    return;
  }
  if (typeof value !== 'string' || value.length > max) throw new Error('Valeur invalide.');
  if (pattern && !pattern.test(value)) throw new Error('Format invalide.');
}

function numberField(value, options) {
  const { required = false, min = -Infinity, max = Infinity, integer = false } = options || {};
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('Champ obligatoire.');
    return;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new Error('Nombre invalide.');
  }
}

function csrfField(value) {
  stringField(value, { required: true, max: 64, pattern: CSRF_RE });
}

/*
 * Validation d'API à schémas explicites.
 * Chaque schéma possède une liste de clés autorisées et une fonction dédiée.
 * Aucun champ fourni par le client n'est fusionné ou copié dynamiquement.
 */
const SCHEMA_KEYS = Object.freeze({
  planteurCreate: Object.freeze(['nom', 'prenoms', 'contact', 'contact_paiement', 'moyen_paiement', '_csrf']),
  planteurUpdate: Object.freeze(['nom', 'prenoms', 'contact', 'contact_paiement', 'moyen_paiement', '_csrf']),
  prix: Object.freeze(['periode', 'prix_kg', '_csrf']),
  pesee: Object.freeze(['periode', 'planteur_id', 'date_pesee', 'poids_kg', '_csrf']),
  information: Object.freeze(['titre', 'contenu', '_csrf']),
  actualiteSource: Object.freeze(['nom', 'url', '_csrf']),
  actualiteManuelle: Object.freeze(['titre', 'resume', 'lien', '_csrf']),
  auth: Object.freeze(['identifiant', 'mot_de_passe', '_csrf']),
  planteurPassword: Object.freeze(['mot_de_passe_actuel', 'nouveau_mot_de_passe', '_csrf']),
  passwordReset: Object.freeze(['identifiant', 'telephone', '_csrf']),
  csrfOnly: Object.freeze(['_csrf']),
});

function rejectUnknownKeys(input, allowedKeys) {
  for (const key of Object.keys(input)) {
    if (!allowedKeys.includes(key)) throw new Error('Champ inattendu.');
  }
}

function validateCsrf(input) {
  if (!hasOwn(input, '_csrf')) throw new Error('Jeton CSRF manquant.');
  csrfField(input._csrf);
}

function validatePlanteur(input) {
  stringField(input.nom, { required: true, max: MAX.name });
  stringField(input.prenoms, { required: true, max: MAX.name });
  stringField(input.contact, { max: MAX.phone });
  stringField(input.contact_paiement, { max: MAX.phone });
  stringField(input.moyen_paiement, { max: MAX.short });
  validateCsrf(input);
}

function validatePrix(input) {
  stringField(input.periode, { required: true, max: 7, pattern: PERIOD_RE });
  numberField(input.prix_kg, { required: true, min: 0, max: 100000000 });
  validateCsrf(input);
}

function validatePesee(input) {
  stringField(input.periode, { required: true, max: 7, pattern: PERIOD_RE });
  numberField(input.planteur_id, { required: true, min: 1, max: 2147483647, integer: true });
  stringField(input.date_pesee, { max: 10, pattern: DATE_RE });
  numberField(input.poids_kg, { required: true, min: 0.000001, max: 1000000 });
  validateCsrf(input);
}

function validateInformation(input) {
  stringField(input.titre, { required: true, max: 200 });
  stringField(input.contenu, { max: MAX.text });
  validateCsrf(input);
}

function validateActualiteSource(input) {
  stringField(input.nom, { required: true, max: 200 });
  stringField(input.url, { required: true, max: MAX.url });
  validateCsrf(input);
}

function validateActualiteManuelle(input) {
  stringField(input.titre, { required: true, max: 200 });
  stringField(input.resume, { max: MAX.text });
  stringField(input.lien, { max: MAX.url });
  validateCsrf(input);
}

function validateAuth(input) {
  stringField(input.identifiant, { required: true, max: 120 });
  stringField(input.mot_de_passe, { required: true, max: 256 });
  validateCsrf(input);
}

function validatePasswordReset(input) {
  stringField(input.identifiant, { required: true, max: 120 });
  stringField(input.telephone, { required: true, max: MAX.phone });
  validateCsrf(input);
}

function validateCsrfOnly(input) {
  validateCsrf(input);
}

function validatePlanteurPassword(input) {
  stringField(input.mot_de_passe_actuel, { required: true, max: 256 });
  stringField(input.nouveau_mot_de_passe, { required: true, max: 256 });
  validateCsrf(input);
}

const schemas = Object.freeze({
  planteurCreate: Object.freeze({ keys: SCHEMA_KEYS.planteurCreate }),
  planteurUpdate: Object.freeze({ keys: SCHEMA_KEYS.planteurUpdate }),
  prix: Object.freeze({ keys: SCHEMA_KEYS.prix }),
  pesee: Object.freeze({ keys: SCHEMA_KEYS.pesee }),
  information: Object.freeze({ keys: SCHEMA_KEYS.information }),
  actualiteSource: Object.freeze({ keys: SCHEMA_KEYS.actualiteSource }),
  actualiteManuelle: Object.freeze({ keys: SCHEMA_KEYS.actualiteManuelle }),
  auth: Object.freeze({ keys: SCHEMA_KEYS.auth }),
  planteurPassword: Object.freeze({ keys: SCHEMA_KEYS.planteurPassword }),
  passwordReset: Object.freeze({ keys: SCHEMA_KEYS.passwordReset }),
  csrfOnly: Object.freeze({ keys: SCHEMA_KEYS.csrfOnly }),
});

function schemaKeysByName(name) {
  switch (name) {
    case 'planteurCreate': return SCHEMA_KEYS.planteurCreate;
    case 'planteurUpdate': return SCHEMA_KEYS.planteurUpdate;
    case 'prix': return SCHEMA_KEYS.prix;
    case 'pesee': return SCHEMA_KEYS.pesee;
    case 'information': return SCHEMA_KEYS.information;
    case 'actualiteSource': return SCHEMA_KEYS.actualiteSource;
    case 'actualiteManuelle': return SCHEMA_KEYS.actualiteManuelle;
    case 'auth': return SCHEMA_KEYS.auth;
    case 'planteurPassword': return SCHEMA_KEYS.planteurPassword;
    case 'passwordReset': return SCHEMA_KEYS.passwordReset;
    case 'csrfOnly': return SCHEMA_KEYS.csrfOnly;
    default: return null;
  }
}

function validatorByName(name) {
  switch (name) {
    case 'planteurCreate': return validatePlanteur;
    case 'planteurUpdate': return validatePlanteur;
    case 'prix': return validatePrix;
    case 'pesee': return validatePesee;
    case 'information': return validateInformation;
    case 'actualiteSource': return validateActualiteSource;
    case 'actualiteManuelle': return validateActualiteManuelle;
    case 'auth': return validateAuth;
    case 'planteurPassword': return validatePlanteurPassword;
    case 'passwordReset': return validatePasswordReset;
    case 'csrfOnly': return validateCsrfOnly;
    default: return null;
  }
}

function validateObject(input, schema) {
  if (!isPlainObject(input)) throw new Error('Corps de requête invalide.');

  let schemaName;
  if (schema === schemas.planteurCreate) schemaName = 'planteurCreate';
  else if (schema === schemas.planteurUpdate) schemaName = 'planteurUpdate';
  else if (schema === schemas.prix) schemaName = 'prix';
  else if (schema === schemas.pesee) schemaName = 'pesee';
  else if (schema === schemas.information) schemaName = 'information';
  else if (schema === schemas.actualiteSource) schemaName = 'actualiteSource';
  else if (schema === schemas.actualiteManuelle) schemaName = 'actualiteManuelle';
  else if (schema === schemas.auth) schemaName = 'auth';
  else if (schema === schemas.planteurPassword) schemaName = 'planteurPassword';
  else if (schema === schemas.passwordReset) schemaName = 'passwordReset';
  else if (schema === schemas.csrfOnly) schemaName = 'csrfOnly';
  else throw new Error('Schéma de validation inconnu.');

  const allowedKeys = schemaKeysByName(schemaName);
  if (!allowedKeys) throw new Error('Schéma de clés inconnu.');
  rejectUnknownKeys(input, allowedKeys);
  const validator = validatorByName(schemaName);
  if (typeof validator !== 'function') throw new Error('Validateur indisponible.');
  validator(input);
}

function validateParamsId(req, res, next) {
  try {
    const params = req.params;
    if (params !== undefined && params !== null && !isPlainObject(params)) {
      throw new Error('Paramètres invalides.');
    }
    if (params && hasOwn(params, 'id')) {
      numberField(params.id, { required: true, min: 1, max: 2147483647, integer: true });
    }
    next();
  } catch {
    return res.status(400).send('Requête invalide.');
  }
}

function validateQuery(req, res, next) {
  try {
    const query = req.query || Object.create(null);
    if (!isPlainObject(query)) throw new Error('Paramètres invalides.');

    const allowed = ['periode', 'q', 'message', 'erreur', 'rafraichir'];
    rejectUnknownKeys(query, allowed);

    if (hasOwn(query, 'periode')) stringField(query.periode, { max: 7, pattern: PERIOD_RE });
    if (hasOwn(query, 'q')) stringField(query.q, { max: 100 });
    if (hasOwn(query, 'rafraichir') && query.rafraichir !== '1') throw new Error('Paramètre invalide.');
    if (hasOwn(query, 'message')) stringField(query.message, { max: 500 });
    if (hasOwn(query, 'erreur')) stringField(query.erreur, { max: 500 });
    next();
  } catch {
    return res.status(400).send('Paramètre de requête invalide.');
  }
}

function schemaByName(name) {
  switch (name) {
    case 'planteurCreate': return schemas.planteurCreate;
    case 'planteurUpdate': return schemas.planteurUpdate;
    case 'prix': return schemas.prix;
    case 'pesee': return schemas.pesee;
    case 'information': return schemas.information;
    case 'actualiteSource': return schemas.actualiteSource;
    case 'actualiteManuelle': return schemas.actualiteManuelle;
    case 'auth': return schemas.auth;
    case 'planteurPassword': return schemas.planteurPassword;
    case 'passwordReset': return schemas.passwordReset;
    case 'csrfOnly': return schemas.csrfOnly;
    default: return null;
  }
}

function validateBody(schemaName) {
  return (req, res, next) => {
    try {
      const schema = schemaByName(schemaName);
      if (!schema) throw new Error('Schéma inconnu.');
      validateObject(req.body, schema);
      next();
    } catch {
      return res.status(400).send('Données envoyées invalides.');
    }
  };
}

function validateMultipartBody(req, res, next) {
  try {
    validateObject(req.body, schemas.information);
    next();
  } catch {
    if (req.file && req.file.path) {
      try { require('fs').unlinkSync(req.file.path); } catch {}
    }
    return res.status(400).send('Données envoyées invalides.');
  }
}

module.exports = {
  schemas,
  validateBody,
  validateParamsId,
  validateQuery,
  validateMultipartBody,
  validateObject,
};
