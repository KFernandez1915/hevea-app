const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'informations');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const EXTENSIONS_AUTORISEES = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  video: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
  audio: ['.mp3', '.wav', '.ogg', '.m4a', '.aac'],
};

// Extension choisie a partir du type MIME (liste blanche), jamais du nom de
// fichier fourni par le client : file.originalname n'est pas fiable.
const EXTENSION_PAR_TYPE = {
  image: '.jpg',
  video: '.mp4',
  audio: '.mp3',
};

function typeMediaDepuisMime(mimetype) {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const type = typeMediaDepuisMime(file.mimetype);
    const ext = EXTENSION_PAR_TYPE[type] || '';
    const nomUnique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, nomUnique);
  },
});

function filtreFichier(req, file, cb) {
  const type = typeMediaDepuisMime(file.mimetype);
  if (!type) return cb(new Error('Type de fichier non autorise. Formats acceptes : image, video, audio.'));
  cb(null, true);
}

const uploadInformation = multer({
  storage,
  fileFilter: filtreFichier,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 Mo
});

module.exports = { uploadInformation, typeMediaDepuisMime, UPLOAD_DIR };
