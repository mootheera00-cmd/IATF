// backend/services/fileService.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ORIGINAL_DIR, PDF_DIR, STAGING_DIR } = require('../config/storage');

const fileService = {
    /**
     * Validate file type and extension
     */
    validateFileType(fileName, fileType, expectedTypes = []) {
        const ext = path.extname(fileName).toLowerCase();
        const validExtensions = expectedTypes.length > 0 
            ? expectedTypes 
            : ['.doc', '.docx', '.xls', '.xlsx'];
        
        if (!validExtensions.some(ext2 => ext.includes(ext2))) {
            throw new Error(`Invalid file type. Expected: ${validExtensions.join(', ')}, Got: ${ext}`);
        }
        return true;
    },

    /**
     * Validate PDF file
     */
    validatePdfFile(fileName) {
        const ext = path.extname(fileName).toLowerCase();
        if (ext !== '.pdf') {
            throw new Error(`Invalid PDF file. Expected .pdf, Got: ${ext}`);
        }
        return true;
    },

    /**
     * Compute SHA256 hash of a file
     */
    async computeFileHash(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('error', reject);
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
    },

    /**
     * Check file size
     */
    validateFileSize(filePath, maxSizeMB = 50) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        if (sizeMB > maxSizeMB) {
            throw new Error(`File size (${sizeMB.toFixed(2)}MB) exceeds maximum allowed (${maxSizeMB}MB)`);
        }
        return true;
    },

    /**
     * Store original source file
     */
    async storeOriginalFile(sourceFile, documentId, revisionId) {
        try {
            this.validateFileType(sourceFile.originalname, sourceFile.mimetype);
            this.validateFileSize(sourceFile.path);

            // Create storage directory if it doesn't exist
            if (!fs.existsSync(ORIGINAL_DIR)) {
                fs.mkdirSync(ORIGINAL_DIR, { recursive: true });
            }

            // Generate unique file name with document ID and timestamp
            const timestamp = Date.now();
            const ext = path.extname(sourceFile.originalname);
            const fileName = `doc-${documentId}-rev-${revisionId}-${timestamp}${ext}`;
            const targetPath = path.join(ORIGINAL_DIR, fileName);

            // Move file to permanent storage
            return new Promise((resolve, reject) => {
                fs.rename(sourceFile.path, targetPath, async (err) => {
                    if (err) {
                        reject(new Error(`Failed to store original file: ${err.message}`));
                    } else {
                        // Compute hash for integrity verification
                        const hash = await this.computeFileHash(targetPath);
                        resolve({
                            uri: targetPath,
                            hash: hash,
                            fileName: fileName,
                            size: fs.statSync(targetPath).size
                        });
                    }
                });
            });
        } catch (error) {
            // Clean up temp file
            if (fs.existsSync(sourceFile.path)) {
                fs.rmSync(sourceFile.path);
            }
            throw error;
        }
    },

    /**
     * Store PDF file
     */
    async storePdfFile(pdfFile, documentId, revisionId) {
        try {
            this.validatePdfFile(pdfFile.originalname);
            this.validateFileSize(pdfFile.path);

            // Create storage directory if it doesn't exist
            if (!fs.existsSync(PDF_DIR)) {
                fs.mkdirSync(PDF_DIR, { recursive: true });
            }

            // Generate unique file name
            const timestamp = Date.now();
            const fileName = `doc-${documentId}-rev-${revisionId}-${timestamp}.pdf`;
            const targetPath = path.join(PDF_DIR, fileName);

            // Move file to permanent storage
            return new Promise((resolve, reject) => {
                fs.rename(pdfFile.path, targetPath, async (err) => {
                    if (err) {
                        reject(new Error(`Failed to store PDF file: ${err.message}`));
                    } else {
                        // Compute hash for integrity verification
                        const hash = await this.computeFileHash(targetPath);
                        resolve({
                            uri: targetPath,
                            hash: hash,
                            fileName: fileName,
                            size: fs.statSync(targetPath).size
                        });
                    }
                });
            });
        } catch (error) {
            // Clean up temp file
            if (fs.existsSync(pdfFile.path)) {
                fs.rmSync(pdfFile.path);
            }
            throw error;
        }
    },

    /**
     * Retrieve a file by path (with access control validation)
     */
    async getFile(filePath, userRole = null) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error('File not found');
            }

            const stats = fs.statSync(filePath);
            const isOriginal = filePath.includes(ORIGINAL_DIR);
            const isPdf = filePath.includes(PDF_DIR);

            // Only allow viewing PDFs for non-owners, restrict original files
            if (isOriginal && userRole && userRole !== 'DOCUMENT_CONTROL' && userRole !== 'ADMIN') {
                throw new Error('Access denied: Original files cannot be viewed by this user role');
            }

            return {
                path: filePath,
                size: stats.size,
                type: isPdf ? 'application/pdf' : 'document',
                canView: !isOriginal || (userRole === 'DOCUMENT_CONTROL' || userRole === 'ADMIN')
            };
        } catch (error) {
            throw new Error(`Error retrieving file: ${error.message}`);
        }
    },

    /**
     * Delete a file (only for cleanup, should be rare)
     */
    async deleteFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                fs.rmSync(filePath);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    },

    /**
     * Verify file integrity using hash comparison
     */
    async verifyFileIntegrity(filePath, expectedHash) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error('File not found');
            }
            const computedHash = await this.computeFileHash(filePath);
            return computedHash === expectedHash;
        } catch (error) {
            throw new Error(`Error verifying file integrity: ${error.message}`);
        }
    },

    /**
     * Get file metadata
     */
    async getFileMetadata(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error('File not found');
            }
            const stats = fs.statSync(filePath);
            const hash = await this.computeFileHash(filePath);

            return {
                path: filePath,
                name: path.basename(filePath),
                size: stats.size,
                createdAt: stats.birthtime,
                modifiedAt: stats.mtime,
                hash: hash,
                isOriginal: filePath.includes(ORIGINAL_DIR),
                isPdf: filePath.includes(PDF_DIR)
            };
        } catch (error) {
            throw new Error(`Error getting file metadata: ${error.message}`);
        }
    }
};

module.exports = fileService;
