const db = require('../db');
const { XMLParser } = require('fast-xml-parser');

// Duree du cache RSS : 10 minutes. Les publications manuelles de l'admin,
// elles, sont toujours lues directement en base (jamais mises en cache).
const CACHE_DUREE_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;
const MAX_ARTICLES_PAR_SOURCE = 25;

const parseur = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  trimValues: true,
});

// Cache en memoire : { fraisJusqua: Date.now() + CACHE_DUREE_MS, articles: [...] }
let cache = null;

function extraireTexte(html) {
  if (!html) return null;
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalise un <item> d'un flux RSS (rss 2.0 ou atom) en objet d'actualite.
function normaliserItem(item, sourceNom) {
  const titre = (item.title && item.title['#text']) || item.title || (item.title && item.title[0]) || null;
  const lien = (item.link && typeof item.link === 'object' && item.link['@_href']) || (typeof item.link === 'string' ? item.link : null) || null;
  const pubDate = (item.pubDate && item.pubDate['#text']) || item.pubDate || item.updated || null;
  const description = extraireTexte((item.description && item.description['#text']) || item.description || item.summary || '');
  const date = pubDate ? new Date(pubDate) : null;

  if (!titre) return null;
  return {
    titre,
    lien,
    description: description || null,
    source: sourceNom,
    date: date && !isNaN(date.getTime()) ? date.toISOString() : null,
    dateVal: date && !isNaN(date.getTime()) ? date.getTime() : 0,
    origine: 'rss',
  };
}

async function recupererSource(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const reponse = await fetch(source.url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HeveaApp/1.0; +RSS)' },
    });
    if (!reponse.ok) {
      console.error(`[rss] Source "${source.nom}" : HTTP ${reponse.status}`);
      return [];
    }
    const xml = await reponse.text();
    const doc = parseur.parse(xml);
    const canal = (doc.rss && doc.rss.channel) || doc.feed || doc;
    const items = (canal.item || canal.entry || []);
    const liste = Array.isArray(items) ? items : [items];
    return liste.map((it) => normaliserItem(it, source.nom)).filter(Boolean);
  } catch (err) {
    console.error(`[rss] Source "${source.nom}" : echec de lecture (${err.name || 'erreur'})`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Regroupe les articles en supprimant les doublons de titre (une meme
// depche relayee par plusieurs sources n'apparait qu'une seule fois).
function dedoublonner(articles) {
  const vus = new Set();
  return articles.filter((a) => {
    const cle = a.titre.toLowerCase().trim();
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

async function chargerArticles() {
  const sources = db.prepare('SELECT * FROM sources_rss WHERE actif = 1').all();
  const tableaux = await Promise.all(sources.map(recupererSource));
  const articles = dedoublonner(tableaux.flat()).sort((a, b) => b.dateVal - a.dateVal);
  return articles.slice(0, MAX_ARTICLES_PAR_SOURCE);
}

// Retourne le flux RSS. Si le cache est encore valide (moins de 10 min),
// il est servi sans aucun appel reseau.
async function obtenirArticlesRss() {
  const maintenant = Date.now();
  if (!cache || maintenant >= cache.fraisJusqua) {
    const articles = await chargerArticles();
    cache = { fraisJusqua: maintenant + CACHE_DUREE_MS, articles };
  }
  return cache.articles;
}

// Force le rechargement immediat du flux (apres ajout/suppression d'une source).
function invaliderCacheRss() {
  cache = null;
}

// Recharge le flux en arriere-plan et remplace le cache, meme si celui-ci est
// encore valide. Utilise par le rafraichissement periodique du serveur.
async function rafraichirFluxRss() {
  const articles = await chargerArticles();
  cache = { fraisJusqua: Date.now() + CACHE_DUREE_MS, articles };
  return articles.length;
}

module.exports = { obtenirArticlesRss, invaliderCacheRss, rafraichirFluxRss, CACHE_DUREE_MS };
