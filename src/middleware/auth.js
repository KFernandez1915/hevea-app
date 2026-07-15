function exigerAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.redirect('/admin/connexion');
}

function exigerPlanteur(req, res, next) {
  if (req.session && req.session.planteurId) return next();
  return res.redirect('/planteur/connexion');
}

module.exports = { exigerAdmin, exigerPlanteur };
