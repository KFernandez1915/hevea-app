const RSSParser = require('rss-parser');
const db = require('../db');

const parser = new RSSParser({ timeout: 8000 });

const DUREE_CACHE_MS = 45 * 60 * 1000; // 45 minutes : evite de solliciter les flux externes a chaque visite
let cache = { items: null, recupereLe: 0 };

function nettoyerTexte(texte) {
  if (!texte) return '';
  // Retire les balises HTML eventuellement presentes dans les flux RSS
  // (certains flux incluent du HTML dans leur resume). Le texte est ensuite
  // affiche via EJS avec echappement automatique (<%= %>), donc aucun risque
  // d'injection meme si un flux renvoyait du contenu malveillant.
  return texte.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function tronquer(texte, longueur) {
  if (!texte || texte.length <= longueur) return texte;
  return texte.slice(0, longueur).replace(/\s+\S*$/, '') + '…';
}

async function recupererUneSource(source) {
  try {
    const flux = await parser.parseURL(source.url);
    return (flux.items || []).slice(0, 12).map((item) => ({
      titre: nettoyerTexte(item.title) || 'Sans titre',
      resume: tronquer(nettoyerTexte(item.contentSnippet || item.content || item.summary || ''), 220),
      lien: item.link || null,
      source: source.nom,
      date: item.isoDate || item.pubDate || null,
      type: 'rss',
    }));
  } catch (err) {
    // Une source indisponible ne doit jamais faire echouer toute la page :
    // on l'ignore silencieusement (cote utilisateur) et on trace l'erreur
    // cote serveur pour que l'admin puisse investiguer si besoin.
    console.warn(`[actualites] Echec recuperation source "${source.nom}" (${source.url}) : ${err.message}`);
    return null;
  }
}

async function recupererItemsRss({ forcerRafraichissement = false } = {}) {
  const maintenant = Date.now();
  if (!forcerRafraichissement && cache.items && maintenant - cache.recupereLe < DUREE_CACHE_MS) {
    return cache.items;
  }

  const sources = db.prepare('SELECT * FROM actualites_sources WHERE actif = 1').all();
  const resultats = await Promise.all(sources.map(recupererUneSource));
  const itemsRss = resultats.filter((r) => r !== null).flat();

  // Si tout echoue (ex: pas d'internet) mais qu'un cache precedent existe,
  // on prefere renvoyer les donnees perimees plutot que rien du tout.
  if (itemsRss.length === 0 && cache.items) {
    return cache.items;
  }

  cache = { items: itemsRss, recupereLe: maintenant };
  return itemsRss;
}

async function recupererActualites({ forcerRafraichissement = false } = {}) {
  // Le flux RSS est mis en cache (couteux, source externe) ; les publications
  // manuelles sont toujours relues en base (peu couteux, local) afin qu'une
  // actualite publiee par l'admin apparaisse immediatement, sans attendre
  // l'expiration du cache RSS.
  const itemsRss = await recupererItemsRss({ forcerRafraichissement });

  const manuelles = db.prepare('SELECT * FROM actualites_manuelles ORDER BY cree_le DESC').all().map((m) => ({
    titre: m.titre,
    resume: m.resume || '',
    lien: m.lien || null,
    source: 'Publication de l\'association',
    date: m.cree_le,
    type: 'manuel',
  }));

  return [...itemsRss, ...manuelles].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db_ = b.date ? new Date(b.date).getTime() : 0;
    return db_ - da;
  });
}

function etatSources() {
  return db.prepare('SELECT * FROM actualites_sources ORDER BY cree_le DESC').all();
}

module.exports = { recupererActualites, etatSources };
