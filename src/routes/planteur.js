const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { exigerPlanteur } = require('../middleware/auth');
const { periodeCourante } = require('../utils/helpers');
const { recupererActualites } = require('../utils/actualites');

const router = express.Router();
router.use(exigerPlanteur);

// Si le planteur est supprime (deplace vers la corbeille) alors qu'il a deja
// une session active, on coupe immediatement son acces des la requete
// suivante, avec le meme message clair qu'a la connexion.
router.use((req, res, next) => {
  const planteur = db.prepare('SELECT statut FROM planteurs WHERE id = ?').get(req.session.planteurId);
  if (!planteur || planteur.statut !== 'actif') {
    return req.session.destroy(() => {
      res.redirect('/planteur/connexion?erreur=' + encodeURIComponent('Votre session est inactive, veuillez contacter l\'administrateur.'));
    });
  }
  next();
});

// Rend le statut "mot de passe temporaire" disponible dans toutes les vues
// planteur : utilise pour afficher un rappel (bandeau non bloquant) tant que
// le mot de passe temporaire n'a pas ete change, sans empecher l'acces au
// reste de l'espace planteur (Historique, Informations restent consultables).
router.use((req, res, next) => {
  const planteur = db.prepare('SELECT mot_de_passe_temporaire FROM planteurs WHERE id = ?').get(req.session.planteurId);
  res.locals.mdpTemporaire = !!(planteur && planteur.mot_de_passe_temporaire);
  next();
});

// Nombre d'informations publiees depuis la derniere visite de la page
// Informations : utilise pour la pastille de notification dans le menu.
router.use((req, res, next) => {
  const { n } = db.prepare(`
    SELECT COUNT(*) AS n FROM informations
    WHERE cree_le > COALESCE(
      (SELECT dernier_vu_informations_le FROM planteurs WHERE id = ?),
      '1970-01-01 00:00:00'
    )
  `).get(req.session.planteurId);
  res.locals.informationsNonLues = n;
  next();
});

function recapPourPlanteur(planteurId, periode) {
  const prixRow = db.prepare('SELECT prix_kg FROM prix_mois WHERE periode = ?').get(periode);
  const prixKg = prixRow ? prixRow.prix_kg : null;
  const agg = db.prepare(`
    SELECT COUNT(*) AS nb_pesees, COALESCE(SUM(poids_kg), 0) AS poids_total
    FROM pesees WHERE planteur_id = ? AND periode = ?
  `).get(planteurId, periode);
  const pesees = db.prepare(`
    SELECT * FROM pesees WHERE planteur_id = ? AND periode = ? ORDER BY date_pesee
  `).all(planteurId, periode);
  return {
    prixKg,
    nbPesees: agg.nb_pesees,
    poidsTotal: agg.poids_total,
    montant: prixKg ? agg.poids_total * prixKg : 0,
    pesees,
  };
}

router.get('/', (req, res) => {
  const periode = periodeCourante();
  const planteur = db.prepare('SELECT * FROM planteurs WHERE id = ?').get(req.session.planteurId);
  const recap = recapPourPlanteur(planteur.id, periode);
  const informationsRecentes = db.prepare('SELECT * FROM informations ORDER BY cree_le DESC LIMIT 5').all();
  const mesPesees = db.prepare(`
    SELECT date_pesee, poids_kg FROM pesees WHERE planteur_id = ? ORDER BY date_pesee ASC, id ASC
  `).all(planteur.id);
  res.render('planteur/dashboard', { planteur, periode, recap, informationsRecentes, mesPesees });
});

router.get('/historique', (req, res) => {
  const planteur = db.prepare('SELECT * FROM planteurs WHERE id = ?').get(req.session.planteurId);
  const periodes = db.prepare(`
    SELECT DISTINCT periode FROM pesees WHERE planteur_id = ? ORDER BY periode DESC
  `).all(planteur.id).map((r) => r.periode);

  const historique = periodes.map((periode) => ({
    periode,
    ...recapPourPlanteur(planteur.id, periode),
  }));

  res.render('planteur/historique', { planteur, historique });
});

router.post('/mot-de-passe', (req, res) => {
  const { mot_de_passe_actuel, nouveau_mot_de_passe } = req.body;
  const planteur = db.prepare('SELECT * FROM planteurs WHERE id = ?').get(req.session.planteurId);
  if (!bcrypt.compareSync(mot_de_passe_actuel || '', planteur.mot_de_passe_hash)) {
    return res.redirect('/planteur?erreur=mdp');
  }
  const hash = bcrypt.hashSync(nouveau_mot_de_passe, 10);
  db.prepare(`
    UPDATE planteurs
    SET mot_de_passe_hash = ?, mot_de_passe_temporaire = 0, mdp_temp_expire_le = NULL
    WHERE id = ?
  `).run(hash, planteur.id);
  res.redirect('/planteur?message=mdp_modifie');
});

router.get('/informations', (req, res) => {
  const planteur = db.prepare('SELECT dernier_vu_informations_le FROM planteurs WHERE id = ?').get(req.session.planteurId);
  const seuil = planteur.dernier_vu_informations_le || '1970-01-01 00:00:00';
  const informations = db.prepare('SELECT * FROM informations ORDER BY cree_le DESC').all()
    .map((info) => ({ ...info, estNouveau: info.cree_le > seuil }));

  db.prepare("UPDATE planteurs SET dernier_vu_informations_le = datetime('now') WHERE id = ?").run(req.session.planteurId);
  res.locals.informationsNonLues = 0;

  res.render('planteur/informations', { informations });
});

router.get('/actualites', async (req, res) => {
  let actualites = [];
  let erreurChargement = null;
  try {
    actualites = await recupererActualites();
  } catch (err) {
    erreurChargement = 'Impossible de recuperer les actualites pour le moment.';
  }
  res.render('planteur/actualites', { actualites, erreurChargement });
});

module.exports = router;
