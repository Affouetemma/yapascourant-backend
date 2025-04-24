require('dotenv').config();

const config = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  PORT: process.env.PORT || 3001,
  MONGODB_URI: process.env.MONGODB_URI,
  CORS_ORIGINS: [
    'https://yapascourant.gombonumerique.com',
    'https://yapascourant-main.vercel.app',
    'http://localhost:3000'
  ]
};

// Validate required environment variables
if (!config.MONGODB_URI) {
  console.error('Missing required environment variable: MONGODB_URI');
  process.exit(1);
}

// Log configuration (excluding sensitive data)
console.log('Configuration loaded:', {
  NODE_ENV: config.NODE_ENV,
  PORT: config.PORT,
  MONGODB_URI: config.MONGODB_URI ? '[SET]' : '[NOT SET]',
  CORS_ORIGINS: config.CORS_ORIGINS
});

module.exports = config;
