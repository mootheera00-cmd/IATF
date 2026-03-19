// backend/services/watermarkService.ts
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { PDF_DIR } = require('../config/storage');

/**
 * Add a transparent "OBSOLETE" watermark to a PDF document.
 * @param {string} inputPath - Path to the original PDF
 * @param {string} watermarkText - Text to display (e.g., 'OBSOLETE - UNCONTROLLED IF PRINTED')
 * @returns {Promise<Buffer>} - The watermarked PDF as a Buffer
 */
async function addWatermark(inputPath: string, watermarkText = 'OBSOLETE') {
  try {
    const existingPdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont('Helvetica-Bold');

    pages.forEach((page: any) => {
      const { width, height } = page.getSize();
      const fontSize = 50;
      const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      // Center the watermark diagonally
      page.drawText(watermarkText, {
        x: width / 2 - textWidth / 2,
        y: height / 2 - textHeight / 2,
        size: fontSize,
        font: font,
        color: rgb(0.95, 0.1, 0.1), // Red color
        opacity: 0.3, // Semi-transparent
        rotate: degrees(45)
      });

      // Add subtle footer for traceability
      page.drawText(`Downloaded: ${new Date().toISOString()} | User: Unknown (System)`, {
        x: 20,
        y: 20,
        size: 10,
        font: font,
        color: rgb(0.5, 0.5, 0.5)
      });
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('Error adding watermark:', error);
    throw new Error('Failed to watermark PDF');
  }
}

export = {
  addWatermark
};
