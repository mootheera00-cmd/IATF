// backend/config/config.ts
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set. Check your .env file.');
}

export = {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
};
