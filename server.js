// server.js - Version avec auto-refresh et proxy
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
const https = require('https');

const app = express();
const cache = new NodeCache({ stdTTL: 300 });

app.use(cors());
app.use(express.json());

// Configuration
const config = {
  apiUrl: 'https://mdamsigicmu.sec.gouv.sn/services/udam/api',
  authUrl: 'https://mdamsigicmu.sec.gouv.sn/api/authenticate',
  credentials: {
    username: 'caisse_sencsu',
    password: 'passer'
  },
  refreshInterval: 3 * 60 * 60 * 1000, // Rafraîchir toutes les 3 heures
  requestTimeout: 30000
};

// Liste de proxies publics
const PROXIES = [
  'http://154.113.113.70:8080',
  'http://103.169.142.0:8080',
  'http://41.77.188.165:8080'
];

let currentToken = null;
let tokenExpiry = null;

// Fonction pour obtenir un token via proxy
async function fetchNewToken() {
  let lastError = null;
  
  // Essayer sans proxy d'abord (peut fonctionner selon le réseau)
  try {
    console.log('🔐 Tentative d\'authentification sans proxy...');
    const response = await axios.post(config.authUrl, config.credentials, {
      timeout: config.requestTimeout,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
    
    if (response.data && response.data.id_token) {
      console.log('✅ Token obtenu sans proxy');
      return response.data.id_token;
    }
  } catch (error) {
    console.log('❌ Sans proxy échoué:', error.message);
    lastError = error;
  }
  
  // Essayer avec chaque proxy
  for (const proxyUrl of PROXIES) {
    try {
      const [protocol, hostPort] = proxyUrl.split('://');
      const [host, port] = hostPort.split(':');
      
      console.log(`🔐 Tentative avec proxy: ${proxyUrl}`);
      
      const response = await axios.post(config.authUrl, config.credentials, {
        timeout: config.requestTimeout,
        proxy: {
          host: host,
          port: parseInt(port),
          protocol: protocol
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false })
      });
      
      if (response.data && response.data.id_token) {
        console.log(`✅ Token obtenu avec proxy ${proxyUrl}`);
        return response.data.id_token;
      }
    } catch (error) {
      console.log(`❌ Proxy ${proxyUrl} échoué:`, error.message);
      lastError = error;
    }
  }
  
  throw lastError || new Error('Impossible d\'obtenir un token');
}

// Initialiser et rafraîchir le token périodiquement
async function refreshToken() {
  try {
    const newToken = await fetchNewToken();
    currentToken = newToken;
    tokenExpiry = Date.now() + config.refreshInterval;
    console.log(`✅ Token rafraîchi avec succès (valide ${config.refreshInterval / 3600000} heures)`);
  } catch (error) {
    console.error('❌ Échec du rafraîchissement token:', error.message);
  }
}

// Rafraîchir au démarrage et périodiquement
refreshToken();
setInterval(refreshToken, config.refreshInterval);

// Middleware pour obtenir un token valide
async function getValidToken() {
  if (currentToken && Date.now() < tokenExpiry) {
    return currentToken;
  }
  await refreshToken();
  return currentToken;
}

// Endpoint: Recherche bénéficiaire
app.get('/api/beneficiaire/:code', async (req, res) => {
  const { code } = req.params;
  const cacheKey = `beneficiaire_${code}`;
  
  try {
    // Vérifier cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log(`📦 Cache hit pour ${code}`);
      return res.json(cachedData);
    }
    
    const token = await getValidToken();
    if (!token) {
      throw new Error('Impossible d\'obtenir un token valide');
    }
    
    console.log(`🔍 Recherche: ${code}`);
    
    const apiUrl = `${config.apiUrl}/beneficiairess/codeImmatriculation?code=${encodeURIComponent(code)}`;
    
    const response = await axios({
      method: 'GET',
      url: apiUrl,
      headers: { 'Authorization': `Bearer ${token}` },
      timeout: config.requestTimeout,
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });
    
    cache.set(cacheKey, response.data);
    console.log(`✅ Bénéficiaire trouvé`);
    res.json(response.data);
    
  } catch (error) {
    console.error(`❌ Erreur:`, error.message);
    res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    tokenValid: currentToken !== null && Date.now() < tokenExpiry,
    tokenExpiry: tokenExpiry ? new Date(tokenExpiry).toISOString() : null,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/token-info', (req, res) => {
  res.json({
    hasToken: currentToken !== null,
    expiresAt: tokenExpiry ? new Date(tokenExpiry).toISOString() : null,
    minutesRemaining: tokenExpiry ? Math.max(0, Math.round((tokenExpiry - Date.now()) / 60000)) : 0
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend avec auto-refresh sur port ${PORT}`);
  console.log(`🔄 Token rafraîchi toutes les ${config.refreshInterval / 3600000} heures`);
  console.log(`🌐 http://localhost:${PORT}/health`);
});