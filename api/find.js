import crypto from 'crypto';

// Helper to generate a random UUIDv4 if needed
function generateUUID() {
  return crypto.randomUUID();
}

export default async function handler(req, res) {
  // 1. Handle CORS Preflight and headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allows any domain or browser to query it
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight browser OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Only allow GET requests from the browser
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed. This endpoint only accepts GET requests.' });
  }

  try {
    // 3. Extract the search query 'q' from the URL: /api/search?q=Teri
    const query = req.query.q;

    if (!query) {
      return res.status(400).json({ 
        error: 'Missing required search query "q". Example usage: /api/search?q=Teri' 
      });
    }

    // Optional query parameters with default fallbacks
    const userid = req.query.userid || generateUUID();
    const platform = req.query.platform || 'com.mxplay.desktop';
    const contentLanguages = req.query.languages || 'hi,en';
    const kidsModeEnabled = req.query.kids_mode || 'false';

    // 4. Set up the target MX Player URL with required query parameters
    const targetUrl = new URL('https://api.mxplayer.in/v1/web/search/resultv2');
    targetUrl.searchParams.append('query', query);
    targetUrl.searchParams.append('device-density', '2');
    targetUrl.searchParams.append('userid', userid);
    targetUrl.searchParams.append('platform', platform);
    targetUrl.searchParams.append('content-languages', contentLanguages);
    targetUrl.searchParams.append('kids-mode-enabled', kidsModeEnabled);

    // 5. Construct the upstream POST body required by MX Player
    const upstreamBody = JSON.stringify({
      query: query,
      filter: { type: [] }
    });

    // 6. Set up the spoofed security headers for the outbound request
    const fallbackGuardKey = "hKZ4lHsRAutrNWFkpA4KXk7FcGvNxATIq3NkA1Fbta4l8V2v1MCIDkIVpvi/FhO3h78aTo56GmqTC6NL+gThbDGC93myejodo8kCn0OT1y68bq1Y9I8MM9vUMZC9TBdeiCmJaJE4YktJz9msI03/B5hNR/zkQlFl88x1Dl5n0v7E2SbTVuNGpIptAA5Z1Juw+61skTrwjpzsiokTOK2RJnJ+zO1UzdoAySRQm/tsLUgRHTmtNth/4+J3cSXYWuZNpkK6XCNqsmfZuLxCjkChQsDh0qnuGetFvSA7RsrwkUZ3lMqkZzBPexIqG7w1CsBLZArj1iYfBYar+wo1I1nP/A==";

    const headers = {
      'Host': 'api.mxplayer.in',
      'referer': 'https://www.mxplayer.in/',
      'x-guard-key': fallbackGuardKey,
      'x-guard-flag': 'true',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'cookie': `platform=${platform}; UserID=${userid}; Content-Languages=${contentLanguages}; languageDismissed=false; scrnWdth=800; scrnDPI=1; isWebpSupported=1;`,
    };

    // 7. Make the POST request internally to MX Player
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: 'POST', // The proxy makes a POST request to MX Player
      headers: headers,
      body: upstreamBody
    });

    // Handle failures from the MX Player backend
    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text();
      return res.status(upstreamResponse.status).json({
        error: `MX Player responded with status ${upstreamResponse.status}`,
        details: errorText
      });
    }

    // 8. Return the JSON results back to the client browser
    const data = await upstreamResponse.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
