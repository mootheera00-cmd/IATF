// backend/config/config.ts
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set. Check your .env file.');
}

export = {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  reportBasePath: process.env.REPORT_BASE_PATH || 'G:/02_Folder 5S/DD === APTC ===/06_APTX reports',
};
