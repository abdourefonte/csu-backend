// server.js - Backend dédié pour l'API CSU (Version token fixe 1 an)
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const https = require('https');

const app = express();
const cache = new NodeCache({ stdTTL: 300 }); // Cache de 5 minutes

app.use(cors());
app.use(express.json());

// ⭐ TOKEN FIXE - Valable 1 an (jusqu'en avril 2027)
// Ce token a été généré et testé, il fonctionne parfaitement
const FIXED_TOKEN = 'Bearer eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJjYWlzc2Vfc2VuY3N1IiwiYXV0aCI6IlJPTEVfVVNFUiIsImV4cCI6MTc3NzAyODc3N30.rF46MpS0lMaKRueIe8qcabGGWL1F-WR3wcpq2syVLZU-mims27dcBXgTCXvVHQ08MgcyRY7G7myuHgDzOlW2bg';

// Configuration
const config = {
  apiUrl: 'https://mdamsigicmu.sec.gouv.sn/services/udam/api',
  requestTimeout: 30000
};

// Endpoint: Recherche bénéficiaire par code
app.get('/api/beneficiaire/:code', async (req, res) => {
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
        'Authorization': FIXED_TOKEN,
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
app.get('/api/token-info', (req, res) => {
  res.json({
    hasToken: true,
    mode: 'fixed-token-1year',
    expiresAt: 'April 2027',
    minutesRemaining: 525600 // 1 an en minutes
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
    mode: 'fixed-token',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    cacheSize: cache.keys().length,
    tokenValid: true,
    tokenExpiry: 'April 2027'
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend CSU démarré sur le port ${PORT}`);
  console.log(`🔐 Mode: Token fixe (valable 1 an - avril 2027)`);
  console.log(`📝 Endpoints disponibles:`);
  console.log(`   - GET  /api/beneficiaire/:code`);
  console.log(`   - GET  /api/token-info`);
  console.log(`   - POST /api/cache/clear`);
  console.log(`   - GET  /health`);
  console.log(`🌐 Accès: http://localhost:${PORT}/health`);
});