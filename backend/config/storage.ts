// backend/config/storage.ts
const path = require('path');
export = {
  // Store Master files OUTSIDE the public uploads folder for security
  // or ensure server.js does not serve this folder.
  // Best practice: Use a dedicated secure folder.
  ORIGINAL_DIR: path.join(__dirname, '..', 'secure_storage', 'doc-original'),
  PDF_DIR: path.join(__dirname, '..', 'uploads', 'doc-pdf'),
  STAGING_DIR: path.join(__dirname, '..', 'uploads', 'staging')
};
