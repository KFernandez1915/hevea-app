document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.pwd-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('data-target'));
      if (!input) return;
      var eye = btn.querySelector('.icon-eye');
      var eyeOff = btn.querySelector('.icon-eye-off');
      if (input.type === 'password') {
        input.type = 'text';
        eye.style.display = 'none';
        eyeOff.style.display = 'block';
        btn.setAttribute('aria-label', 'Masquer le mot de passe');
      } else {
        input.type = 'password';
        eye.style.display = 'block';
        eyeOff.style.display = 'none';
        btn.setAttribute('aria-label', 'Afficher le mot de passe');
      }
    });
  });
});
