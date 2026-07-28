export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    const targetUrl = new URL(url);

    // 1. Add ALL the specific headers from your original request here
    const fetchOptions = {
      method: 'GET',
      headers: {
        'preferred-lang': 'hindi',
        'referer': 'https://kukutv.app',
        'x-source-service': 'app',
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'package-name': 'com.vlv.app.reels',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'cookie': 'guest_user_id=19afb9c4-bb56-4789-a15d-071353907227; preferredLang=hindi; has_strip_banner=true'
      },
      // If the target returns a 308 redirect and you want node to follow it automatically:
      redirect: 'follow', 
    };

    // 2. Fetch the target URL
    const response = await fetch(targetUrl.toString(), fetchOptions);

    // 3. Parse the response based on its content type
    const contentType = response.headers.get('content-type') || '';
    let data;
    
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // 4. Set CORS so your frontend can read the response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // 5. Send the response back to your client
    return res.status(response.status).send(data);

  } catch (error) {
    console.error('Proxy Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch the requested resource' });
  }
}
