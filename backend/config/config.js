// backend/config/config.js
module.exports = {
  jwtSecret: 'NSK_IATF16949_DOC_CONTROL_SUPER_SECRET_KEY', // เปลี่ยนเป็นค่าอื่นตอนขึ้นจริง
  jwtExpiresIn: '8h',
  reportBasePath: process.env.REPORT_BASE_PATH || 'G:/02_Folder 5S/DD === APTC ===/06_APTX reports'
};
