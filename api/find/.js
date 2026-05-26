export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. EXTRACT THE TARGET PATH
  let targetPath = "/PublicBhuApi/api/edata"; // Fallback default
  
  if (req.query && req.query.path) {
    // Handles Method 2: ?path=PublicBhuApi/api/edata
    targetPath = req.query.path.startsWith('/') ? req.query.path : '/' + req.query.path;
  } else if (req.url) {
    // Handles Method 1: Extracts from /api/find/PublicBhuApi/... after routing
    const cleanUrl = req.url.split('?')[0];
    if (cleanUrl.startsWith('/api/find/')) {
      targetPath = req.url.substring('/api/find'.length);
    } else if (cleanUrl.includes('/api/find')) {
      const parts = req.url.split('/api/find');
      if (parts[1]) {
        targetPath = parts[1];
      }
    }
  }

  const targetUrl = `https://upbhulekh.gov.in${targetPath}`;

  // 2. CONSTRUCT BROWSER-LIKE HEADERS
  const incomingHeaders = req.headers || {};
  const headers = {
    "host": "upbhulekh.gov.in",
    "origin": "https://upbhulekh.gov.in",
    "referer": "https://upbhulekh.gov.in/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json",
    "accept-encoding": "gzip, deflate, br",
  };

  // Forward session identifiers if present
  if (incomingHeaders.cookie) {
    headers["cookie"] = incomingHeaders.cookie;
  }
  if (incomingHeaders.authorization) {
    headers["authorization"] = incomingHeaders.authorization;
  }

  // 3. RETRIEVE POST BODY
  let requestBody = undefined;
  if (req.method === 'POST' || req.method === 'PUT') {
    if (req.body) {
      requestBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
  }

  try {
    // 4. FORWARD REQUEST
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: requestBody,
    });

    const responseText = await response.text();

    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    return res.status(response.status).send(responseText);

  } catch (error) {
    return res.status(500).json({
      error: "Proxy request to UP Bhulekh failed",
      details: error.message,
    });
  }
}
