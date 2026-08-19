/**
 * Limiteur de requetes tres simple, en memoire (sans dependance externe).
 * Objectif : freiner le brute-force / enumeration sur des routes sensibles
 * (ex: mot de passe oublie) en complement des protections par compte
 * (delai anti-spam, compteur de tentatives, verrouillage).
 *
 * Ce n'est pas un rate-limiter distribue (il ne survit pas a un redemarrage
 * ni ne se partage entre plusieurs instances du serveur) : suffisant pour
 * une petite application mono-instance, mais a remplacer par une solution
 * partagee (Redis, etc.) si l'appli est un jour deployee en multi-instance.
 */

const compteurs = new Map(); // cle: `${prefixe}:${ip}` -> { count, depuis }

function limiterParIp(prefixe, ip, maxRequetes, fenetreMs) {
  const cle = `${prefixe}:${ip || 'inconnu'}`;
  const maintenant = Date.now();
  const entree = compteurs.get(cle);

  if (!entree || maintenant - entree.depuis > fenetreMs) {
    compteurs.set(cle, { count: 1, depuis: maintenant });
    return { bloque: false };
  }

  entree.count += 1;
  if (entree.count > maxRequetes) {
    return { bloque: true };
  }
  return { bloque: false };
}

// Nettoyage periodique pour eviter une fuite memoire sur le long terme.
setInterval(() => {
  const maintenant = Date.now();
  for (const [cle, entree] of compteurs.entries()) {
    if (maintenant - entree.depuis > 60 * 60 * 1000) compteurs.delete(cle);
  }
}, 15 * 60 * 1000).unref();

module.exports = { limiterParIp };
