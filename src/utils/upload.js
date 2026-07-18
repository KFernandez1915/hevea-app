const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'informations');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const TYPES_AUTORISES = {
  // images
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  // videos
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  // audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/x-m4a': 'audio',
  'audio/mp4': 'audio',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const nomUnique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, nomUnique);
  },
});

function fileFilter(req, file, cb) {
  if (TYPES_AUTORISES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorise. Formats acceptes : images, videos, audio.'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 Mo
});

function typeDepuisMime(mime) {
  return TYPES_AUTORISES[mime] || null;
}

module.exports = { upload, typeDepuisMime, UPLOAD_DIR };
