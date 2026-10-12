require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || './data/shark-quiz.db',
  appName: process.env.APP_NAME || 'SHARK QUIZ',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123'
};
