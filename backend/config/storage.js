const path = require('path');
module.exports = {
  ORIGINAL_DIR: path.join(__dirname, '..', 'uploads', 'doc-original'),
  PDF_DIR:      path.join(__dirname, '..', 'uploads', 'doc-pdf'),
  STAGING_DIR:  path.join(__dirname, '..', 'uploads', 'staging'),
};