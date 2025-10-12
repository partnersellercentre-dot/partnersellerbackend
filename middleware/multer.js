const multer = require("multer");
const path = require("path");

// Store files temporarily before uploading to Cloudinary
const storage = multer.memoryStorage();

const upload = multer({ storage });

module.exports = upload;
