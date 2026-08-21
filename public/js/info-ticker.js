document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.info-ticker').forEach(function (ticker) {
    var slides = Array.from(ticker.querySelectorAll('.info-ticker-slide'));
    if (slides.length === 0) return;

    function activate(i) {
      slides.forEach(function (s, si) {
        var actif = si === i;
        s.classList.toggle('active', actif);
        if (actif) {
          // Relance l'animation de defilement du texte depuis le debut a chaque activation.
          var texte = s.querySelector('.info-ticker-text');
          if (texte) {
            texte.style.animation = 'none';
            void texte.offsetWidth;
            texte.style.animation = '';
          }
          // Relance la lecture de la video si presente (autoplay muet, en boucle).
          var video = s.querySelector('video');
          if (video) {
            video.currentTime = 0;
            video.play().catch(function () {});
          }
        }
      });
    }

    activate(0);
    if (slides.length > 1) {
      var idx = 0;
      setInterval(function () {
        idx = (idx + 1) % slides.length;
        activate(idx);
      }, 7000);
    }
  });
});
