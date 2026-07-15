const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { exigerPlanteur } = require('../middleware/auth');
const { periodeCourante } = require('../utils/helpers');

const router = express.Router();
router.use(exigerPlanteur);

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
  res.render('planteur/dashboard', { planteur, periode, recap });
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
  db.prepare('UPDATE planteurs SET mot_de_passe_hash = ?, mot_de_passe_temporaire = 0 WHERE id = ?').run(hash, planteur.id);
  res.redirect('/planteur?message=mdp_modifie');
});

module.exports = router;
