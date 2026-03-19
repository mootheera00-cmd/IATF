// middleware/validateUpload.ts
const PDF = 'application/pdf';
const ORIG = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];
const isPdf = (f: any) => f?.mimetype === PDF && /\.pdf$/i.test(f.originalname);
const isOriginal = (f: any) => ORIG.includes(f?.mimetype) && /\.(docx|xlsx)$/i.test(f.originalname);

export = { isPdf, isOriginal };
