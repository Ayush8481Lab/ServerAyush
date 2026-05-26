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
    targetPath = req.query.path.startsWith('/') ? req.query.path : '/' + req.query.path;
  } else if (req.url) {
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

  // 2. CONSTRUCT POST BODY FROM GET OR POST REQUESTS
  let requestBody = undefined;

  if (req.method === 'POST' || req.method === 'PUT') {
    // If the client actually made a POST request, use their provided body
    if (req.body) {
      requestBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
  } else {
    // If the client made a GET request (browser), construct the POST payload from query parameters
    if (req.query.body || req.query.payload) {
      const rawPayload = req.query.body || req.query.payload;
      try {
        // Validate and use if it is already a JSON string
        JSON.parse(rawPayload);
        requestBody = rawPayload;
      } catch (e) {
        requestBody = JSON.stringify({ data: rawPayload });
      }
    } else {
      // Collect all query parameters except the routing 'path' parameter
      const bodyObj = { ...req.query };
      delete bodyObj.path;
      
      // Send as JSON payload
      requestBody = JSON.stringify(bodyObj);
    }
  }

  // 3. CONSTRUCT BROWSER-LIKE HEADERS
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

  // Forward optional cookies/authorization if sent
  if (incomingHeaders.cookie) {
    headers["cookie"] = incomingHeaders.cookie;
  }
  if (incomingHeaders.authorization) {
    headers["authorization"] = incomingHeaders.authorization;
  }

  try {
    // 4. FORWARD TO TARGET (Forcing POST)
    const response = await fetch(targetUrl, {
      method: "POST", // Always force POST to UP Bhulekh
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
