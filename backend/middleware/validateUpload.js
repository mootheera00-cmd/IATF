const PDF='application/pdf',
      ORIG=['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const isPdf = f => f?.mimetype===PDF && /\.pdf$/i.test(f.originalname);
const isOriginal = f => ORIG.includes(f?.mimetype) && /\.(docx|xlsx)$/i.test(f.originalname);
module.exports = { isPdf, isOriginal };