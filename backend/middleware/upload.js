/**
 * middleware/upload.js
 *
 * Multer configuration for accepting two OpenAPI spec files in a single
 * multipart/form-data request.
 *
 * Files are kept in memory (not written to disk) so the pipeline can
 * process them inline without any temp-file cleanup. The 5 MB per-file
 * limit covers the vast majority of real-world specs; revisit if we add
 * large enterprise spec support.
 *
 * Expected field names: "v1" (old spec) and "v2" (new spec).
 */

const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  const allowed = [
    'application/json',
    'application/x-yaml',
    'text/yaml',
    'text/x-yaml',
    // Browsers often send YAML files as octet-stream
    'application/octet-stream',
  ];
  if (allowed.includes(file.mimetype) || file.originalname.match(/\.(ya?ml|json)$/i)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}. Upload a .yaml, .yml, or .json file.`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});

// Accepts exactly two fields named "v1" and "v2", one file each.
const uploadSpecPair = upload.fields([
  { name: 'v1', maxCount: 1 },
  { name: 'v2', maxCount: 1 },
]);

module.exports = { uploadSpecPair };
