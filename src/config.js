// System Configuration
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,
  HOST: process.env.HOST || '0.0.0.0',
  ENV: process.env.NODE_ENV || 'development',
  DATA_DIR: path.join(__dirname, '..', 'data'),
  CRM_DB_FILE: path.join(__dirname, '..', 'data', 'crm_data.json'),
  
  // Agent Persona and Strategy
  AGENT: {
    name: 'Ava',
    role: 'Senior Solutions Executive at ApexAI Technologies',
    company: 'ApexAI Technologies',
    product: 'ApexAI Sales Engine',
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'es', 'hi', 'fr', 'de', 'ja']
  },

  // Qualification Thresholds
  QUALIFICATION: {
    HOT_THRESHOLD: 75,
    WARM_THRESHOLD: 45,
    MIN_BUDGET_ENTERPRISE: 20000,
    MIN_BUDGET_GROWTH: 5000
  }
};
