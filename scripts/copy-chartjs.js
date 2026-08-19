// Copie le build UMD minifie de Chart.js depuis node_modules vers
// public/js/vendor, pour que l'appli serve le graphique en local (pas de
// dependance a un CDN externe - important pour l'APK, qui peut tourner
// avec une connexion limitee ou passer par un webview restrictif).
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js');
const destDir = path.join(__dirname, '..', 'public', 'js', 'vendor');
const dest = path.join(destDir, 'chart.umd.min.js');

if (!fs.existsSync(source)) {
  console.warn('[postinstall] chart.js introuvable dans node_modules, copie ignoree.');
  process.exit(0);
}

if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(source, dest);
console.log('[postinstall] Chart.js copie vers public/js/vendor/chart.umd.min.js');
