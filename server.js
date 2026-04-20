// server.js - Backend dédié pour l'API CSU
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const https = require('https');

const app = express();
const cache = new NodeCache({ stdTTL: 300 }); // Cache de 5 minutes

app.use(cors());
app.use(express.json());

// Configuration
const config = {
  apiUrl: 'https://mdamsigicmu.sec.gouv.sn/services/udam/api',
  authUrl: 'https://mdamsigicmu.sec.gouv.sn/api/authenticate',
  credentials: {
    username: process.env.API_USERNAME || 'caisse_sencsu',
    password: process.env.API_PASSWORD || 'passer'
  },
  tokenCacheTime: 4 * 60 * 60, // 4 heures
  requestTimeout: 30000
};

// Gestionnaire de token avec cache
class TokenManager {
  constructor() {
    this.token = null;
    this.expiry = null;
  }

  async getValidToken() {
    // Vérifier si le token est encore valide
    if (this.token && this.expiry && Date.now() < this.expiry) {
      console.log('✅ Token encore valide (expire dans', Math.round((this.expiry - Date.now()) / 1000 / 60), 'minutes)');
      return this.token;
    }

    console.log('🔄 Token expiré ou inexistant, renouvellement...');
    
    try {
      const response = await axios.post(config.authUrl, config.credentials, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: config.requestTimeout
      });

      if (!response.data || !response.data.id_token) {
        throw new Error('Token non reçu');
      }

      this.token = response.data.id_token;
      this.expiry = Date.now() + config.tokenCacheTime * 1000;
      
      console.log('✅ Nouveau token obtenu, expire dans', config.tokenCacheTime / 3600, 'heures');
      return this.token;
      
    } catch (error) {
      console.error('❌ Erreur authentification:', error.message);
      throw new Error('Impossible d\'obtenir un token valide');
    }
  }
}

const tokenManager = new TokenManager();

// Middleware pour ajouter le token aux requêtes
async function addAuthHeader(req, res, next) {
  try {
    const token = await tokenManager.getValidToken();
    req.authToken = token;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Erreur d\'authentification', message: error.message });
  }
}

// Endpoint: Recherche bénéficiaire par code
app.get('/api/beneficiaire/:code', addAuthHeader, async (req, res) => {
  const { code } = req.params;
  const cacheKey = `beneficiaire_${code}`;
  
  try {
    // Vérifier le cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`📦 Cache hit pour ${code}`);
      return res.json(cachedData);
    }
    
    console.log(`🔍 Recherche du bénéficiaire ${code}...`);
    
    const response = await axios({
      method: 'GET',
      url: `${config.apiUrl}/beneficiairess/codeImmatriculation?code=${encodeURIComponent(code)}`,
      headers: {
        'Authorization': `Bearer ${req.authToken}`,
        'Accept': 'application/json'
      },
      timeout: config.requestTimeout,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
    
    // Mettre en cache
    cache.set(cacheKey, response.data);
    console.log(`✅ Bénéficiaire ${code} trouvé et mis en cache`);
    
    res.json(response.data);
    
  } catch (error) {
    console.error(`❌ Erreur pour ${code}:`, error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Bénéficiaire non trouvé' });
    }
    
    res.status(500).json({ 
      error: 'Erreur lors de la recherche',
      details: error.message,
      code: error.code
    });
  }
});

// Endpoint: Statistiques token
app.get('/api/token-info', async (req, res) => {
  res.json({
    hasToken: tokenManager.token !== null,
    expiresIn: tokenManager.expiry ? Math.max(0, Math.round((tokenManager.expiry - Date.now()) / 1000 / 60)) : 0,
    minutesRemaining: tokenManager.expiry ? Math.max(0, Math.round((tokenManager.expiry - Date.now()) / 1000 / 60)) : 0
  });
});

// Endpoint: Vider le cache
app.post('/api/cache/clear', (req, res) => {
  cache.flushAll();
  res.json({ message: 'Cache vidé', timestamp: new Date().toISOString() });
});

// Endpoint: Santé
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    cacheSize: cache.keys().length,
    tokenValid: tokenManager.token !== null && tokenManager.expiry > Date.now()
  });
});

// Démarrer le serveur
// Démarrer le serveur
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {  // ← Ajouter '0.0.0.0'
  console.log(`🚀 Backend CSU démarré sur le port ${PORT}`);
  console.log(`📝 Endpoints disponibles:`);
  console.log(`   - GET  /api/beneficiaire/:code`);
  console.log(`   - GET  /api/token-info`);
  console.log(`   - POST /api/cache/clear`);
  console.log(`   - GET  /health`);
  console.log(`🌐 Accès: http://localhost:${PORT}/health`);
});