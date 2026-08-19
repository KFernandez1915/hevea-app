const crypto = require('crypto');

function genererMotDePasseTemporaire() {
  const chiffres = Math.floor(1000 + Math.random() * 9000);
  const suffixes = ['hevea', 'planteur', 'assoc'];
  const s = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${s}${chiffres}`;
}

// Code numerique a 6 chiffres, genere via un generateur cryptographiquement sur
// (et non Math.random, previsible) : utilise pour la reinitialisation de mot de passe.
function genererCodeReinitialisation() {
  return String(crypto.randomInt(100000, 1000000));
}

// Mot de passe temporaire genere cote serveur (utilise pour "mot de passe oublie",
// affiche une seule fois a l'ecran). Alphabet volontairement sans caracteres
// ambigus (0/O, 1/l/I) pour rester lisible, avec suffisamment d'entropie
// (10 caracteres sur un alphabet de 32 ~ 50 bits) et genere via crypto (sur).
function genererMotDePasseTemporaireSecurise() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let mdp = '';
  for (let i = 0; i < 10; i++) {
    mdp += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return mdp;
}

function genererIdentifiant(nom, prenoms, existants) {
  const base = (prenoms[0] + nom).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  let identifiant = base;
  let i = 1;
  while (existants.has(identifiant)) {
    identifiant = `${base}${i}`;
    i += 1;
  }
  return identifiant;
}

function formaterMontant(valeur) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(valeur || 0) + ' FCFA';
}

function formaterPeriode(periode) {
  // periode: 'YYYY-MM' -> 'Juillet 2026'
  const mois = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
  const [annee, m] = periode.split('-');
  return `${mois[parseInt(m, 10) - 1]} ${annee}`;
}

function periodeCourante() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${m}`;
}

module.exports = {
  genererMotDePasseTemporaire,
  genererCodeReinitialisation,
  genererMotDePasseTemporaireSecurise,
  genererIdentifiant,
  formaterMontant,
  formaterPeriode,
  periodeCourante,
};
