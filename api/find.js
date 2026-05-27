export default async function handler(req, res) {
  // CORS configuration to allow your frontend or browser to access the endpoint
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Accept GET request from your browser
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed. Use GET.' });
  }

  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter "q". Example: /api/search?q=Teri' });
  }

  // 1. Exact URL and Query Parameters from the original capture
  const targetUrl = new URL('https://api.mxplayer.in/v1/web/search/resultv2');
  targetUrl.searchParams.append('query', query); // Dynamically set search term
  targetUrl.searchParams.append('device-density', '2');
  targetUrl.searchParams.append('userid', '0cb7cc11-888e-4a7f-91c5-03324e874fc6');
  targetUrl.searchParams.append('platform', 'com.mxplay.desktop');
  targetUrl.searchParams.append('content-languages', 'hi,en');
  targetUrl.searchParams.append('kids-mode-enabled', 'false');

  // 2. Exact Post Request Body Schema (Query is dynamically replaced)
  const upstreamBody = JSON.stringify({
    filters: { type: [] },
    query: query
  });

  // 3. Exact Headers and Cookie Strings from the original capture
  const headers = {
    'Host': 'api.mxplayer.in',
    'referer': 'https://www.mxplayer.in/',
    'x-guard-key': 'hKZ4lHsRAutrNWFkpA4KXk7FcGvNxATIq3NkA1Fbta4l8V2v1MCIDkIVpvi/FhO3h78aTo56GmqTC6NL+gThbDGC93myejodo8kCn0OT1y68bq1Y9I8MM9vUMZC9TBdeiCmJaJE4YktJz9msI03/B5hNR/zkQlFl88x1Dl5n0v7E2SbTVuNGpIptAA5Z1Juw+61skTrwjpzsiokTOK2RJnJ+zO1UzdoAySRQm/tsLUgRHTmtNth/4+J3cSXYWuZNpkK6XCNqsmfZuLxCjkChQsDh0qnuGetFvSA7RsrwkUZ3lMqkZzBPexIqG7w1CsBLZArj1iYfBYar+wo1I1nP/A==',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'accept': 'application/json, text/plain, */*',
    'content-type': 'application/json',
    'x-guard-flag': 'true',
    'cookie': 'platform=com.mxplay.desktop; UserID=0cb7cc11-888e-4a7f-91c5-03324e874fc6; languageDismissed=false; Content-Languages=hi,en; _scor_uid=9269cfc7b703400a8420e79fc31ef7d3; _fbp=fb.1.1779908541661.15703676466149378; _gid=GA1.2.1164952542.1779908542; scrnWdth=800; scrnDPI=1; isWebpSupported=1; _gat=1; _gcl_au=1.1.1975758585.1779908543; _ga_L9MTP48BE1=GS2.1.s1779908542$o1$g0$t1779908542$j60$l0$h0; _ga=GA1.1.278093201.1779908542',
    'priority': 'u=1, i',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site'
  };

  try {
    // 4. Send the POST request to the original MX Player endpoint
    const response = await fetch(targetUrl.toString(), {
      method: 'POST',
      headers: headers,
      body: upstreamBody
    });

    const status = response.status;
    const responseText = await response.text();

    if (status >= 400) {
      return res.status(status).json({
        error: `MX Player API returned status ${status}`,
        details: responseText
      });
    }

    const data = JSON.parse(responseText);
    return res.status(200).json(data);

  } catch (error) {
    console.error('Proxy Exception:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
