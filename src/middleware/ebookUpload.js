const multer = require('multer');

const allowedExtensions = new Set(['.doc', '.docx', '.pdf', '.xlsx']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 4, fieldSize: 1024 },
  fileFilter(req, file, done) {
    const extension = file.originalname.toLowerCase().match(/\.[^.]+$/);
    if (!extension || !allowedExtensions.has(extension[0])) {
      return done(new Error('Upload a .doc, .docx, .pdf, or .xlsx file.'));
    }
    done(null, true);
  },
});

module.exports = function ebookUpload(req, res, next) {
  upload.single('document')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).render('error', {
        title: 'File too large',
        message: 'E-Book files must be 3 MB or smaller.',
      });
    }
    if (err instanceof multer.MulterError || err.message === 'Upload a .doc, .docx, .pdf, or .xlsx file.') {
      return res.status(400).render('error', { title: 'Invalid upload', message: err.message });
    }
    next(err);
  });
};
