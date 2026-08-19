/* ==========================================================
   Animations GSAP legeres, appliquees automatiquement sur toutes
   les pages : apparition en fondu des cartes/statistiques au
   chargement, et des lignes de tableau au defilement. Rien
   d'agressif (tier "subtle") — appli de gestion pour une
   cooperative, pas une page marketing. Se degrade proprement si
   GSAP n'est pas charge ou si l'utilisateur prefere moins
   d'animations.

   Garde-fou important : quand on change d'onglet (ou qu'on revient
   sur la page via le bouton "retour" du navigateur/telephone), le
   navigateur peut restaurer la page depuis son cache memoire
   (bfcache) exactement dans l'etat ou elle a ete figee — y compris
   en plein milieu d'un fondu GSAP. Comme cette restauration ne
   redeclenche pas DOMContentLoaded, le contenu peut rester bloque
   a moitie invisible. On s'en protege de deux facons : (1) chaque
   animation nettoie ses styles en ligne des qu'elle se termine
   (clearProps), et (2) un ecouteur "pageshow" remet tout a l'etat
   final visible des que la page revient au premier plan.
   ========================================================== */
(function () {
  var ANIMATED_SELECTORS = '.grid-stats .stat, .container > .card, tbody tr, .reveal';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  // Filet de securite : force tout le monde a etre visible, quel que
  // soit l'etat dans lequel GSAP a pu laisser les choses.
  function forceVisible() {
    document.querySelectorAll(ANIMATED_SELECTORS + ', .stat .value').forEach(function (el) {
      el.style.opacity = '';
      el.style.transform = '';
    });
  }

  function runAnimations() {
    if (!window.gsap) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Statistiques + cartes visibles au chargement : petit fondu en cascade
    var stats = document.querySelectorAll('.grid-stats .stat');
    if (stats.length) {
      gsap.from(stats, { opacity: 0, y: 10, duration: 0.4, ease: 'power1.out', stagger: 0.045, clearProps: 'opacity,transform' });
    }

    var cards = document.querySelectorAll('.container > .card');
    if (cards.length) {
      gsap.from(cards, { opacity: 0, y: 10, duration: 0.4, ease: 'power1.out', stagger: 0.05, delay: stats.length ? 0.1 : 0, clearProps: 'opacity,transform' });
    }

    // Compteur anime sur les valeurs numeriques des cartes statistiques
    // (garde le texte d'origine intact pour les valeurs non numeriques,
    // ex. "Non defini", et remet la valeur exacte a la fin de l'anim pour
    // eviter tout arrondi visible).
    document.querySelectorAll('.stat .value').forEach(function (el) {
      var raw = el.textContent.trim();
      var match = raw.match(/\d[\d\s\u00A0.,]*\d|\d/);
      if (!match) return;
      var numStr = match[0];
      var before = raw.slice(0, match.index);
      var after = raw.slice(match.index + numStr.length);
      var normalized = numStr.replace(/[\s\u00A0]/g, '').replace(',', '.');
      var target = parseFloat(normalized);
      if (isNaN(target)) return;
      var decimals = (normalized.split('.')[1] || '').length;
      var counter = { val: 0 };
      gsap.to(counter, {
        val: target,
        duration: 0.85,
        delay: 0.2,
        ease: 'power2.out',
        onUpdate: function () {
          el.textContent = before + counter.val.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + after;
        },
        onComplete: function () { el.textContent = raw; },
      });
    });

    // Lignes de tableau : legere cascade a l'apparition (limitee aux 20
    // premieres lignes visibles pour ne pas ralentir les longues listes)
    var rows = document.querySelectorAll('tbody tr');
    if (rows.length) {
      var visibleRows = Array.prototype.slice.call(rows, 0, 20);
      gsap.from(visibleRows, { opacity: 0, y: 6, duration: 0.3, ease: 'power1.out', stagger: 0.025, delay: 0.15, clearProps: 'opacity,transform' });
    }

    // Reveal au defilement pour tout element marque .reveal (si present)
    var revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      revealEls.forEach(function (el) {
        gsap.from(el, {
          opacity: 0,
          y: 12,
          duration: 0.35,
          ease: 'power1.out',
          clearProps: 'opacity,transform',
          scrollTrigger: { trigger: el, start: 'top 92%', toggleActions: 'play none none reverse' },
        });
      });
    }

    // Filet de securite supplementaire : quoi qu'il arrive (onglet change
    // en plein milieu, animation interrompue...), on garantit un etat
    // pleinement visible peu apres le chargement.
    window.setTimeout(forceVisible, 1500);
  }

  ready(runAnimations);

  // Restauration depuis le bfcache (retour en arriere, changement
  // d'onglet puis retour) : on force l'affichage complet immediatement,
  // sans repartir d'un fondu depuis zero.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      forceVisible();
    }
  });

  // Onglet remis au premier plan alors qu'une animation etait en cours :
  // on s'assure que rien ne reste bloque a mi-fondu.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      forceVisible();
    }
  });
})();
