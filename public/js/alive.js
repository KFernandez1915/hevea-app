document.addEventListener('DOMContentLoaded', function () {
  // Apparition en fondu, decalee, des cartes/lignes visibles au chargement.
  // La classe est retiree des que l'animation se termine : sinon elle
  // continuerait a imposer sa valeur "transform" figee et empecherait le
  // survol (:hover) de reprendre la main sur cette meme propriete.
  var reveals = document.querySelectorAll('.card, .stat, .info-post');
  reveals.forEach(function (el, i) {
    el.style.setProperty('--reveal-delay', Math.min(i * 40, 320) + 'ms');
    el.classList.add('reveal');
    el.addEventListener('animationend', function handler() {
      el.classList.remove('reveal');
      el.style.removeProperty('--reveal-delay');
      el.removeEventListener('animationend', handler);
    });
  });

  // Compteur anime sur les valeurs numeriques des cartes-stats (montants,
  // poids...). Ne touche que le premier nombre trouve dans le texte ; si
  // aucun nombre n'est detecte (ex: "Non defini"), l'element est laisse tel
  // quel. Le texte final est toujours remis a l'identique de l'original,
  // garantissant qu'aucun formatage (espaces, devise, unite) n'est perdu.
  function animerValeur(el) {
    var original = el.textContent.trim();
    var match = original.match(/[\d\s]+([.,]\d+)?/);
    if (!match) return;

    var numTexte = match[0].replace(/\s/g, '').replace(',', '.');
    var cible = parseFloat(numTexte);
    if (isNaN(cible)) return;

    var avant = original.slice(0, match.index);
    var apres = original.slice(match.index + match[0].length);
    var decimales = numTexte.indexOf('.') !== -1 ? 1 : 0;
    var duree = 700;
    var debut = null;

    function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

    function etape(horodatage) {
      if (!debut) debut = horodatage;
      var progression = Math.min((horodatage - debut) / duree, 1);
      var valeurCourante = cible * easeOutCubic(progression);
      var affichage = decimales
        ? valeurCourante.toFixed(1)
        : Math.round(valeurCourante).toLocaleString('fr-FR');
      el.textContent = avant + affichage + apres;
      if (progression < 1) {
        requestAnimationFrame(etape);
      } else {
        el.textContent = original;
      }
    }
    requestAnimationFrame(etape);
  }

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.stat .value').forEach(animerValeur);
  }
});
