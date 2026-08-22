export default async function handler(req, res) {
  // 1. Get the URL from the query parameter (?url=..
  const { url } = req.query;

  // 2. Check if URL is provided
  if (!url) {
    return res.status(400).json({ error: 'Missing "url" query parameter. Usage: /api/proxy?url=YOUR_M3U_LINK' });
  }

  // 3. Validate the URL format
  try {
    new URL(url);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid URL provided.' });
  }

  try {
    // 4. Fetch the M3U/M3U8 playlist while spoofing TiviMate / Android TV headers
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        // This User-Agent mimics TiviMate running on Android TV with ExoPlayer
        'User-Agent': 'TiviMate/4.7.0 (Linux; Android 11; Android TV) ExoPlayerLib/2.18.1',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        // 'Icy-MetaData' is often expected by IPTV/Shoutcast streaming servers
        'Icy-MetaData': '1' 
      }
    });

    // 5. Handle provider errors (e.g., 403 Forbidden, 404 Not Found)
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Provider rejected the request: ${response.status} ${response.statusText}` 
      });
    }

    // 6. Get the raw text data of the M3U playlist
    const textData = await response.text();

    // 7. Set CORS headers so you can call this API from any frontend if needed
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    // Set content type to plain text so it renders nicely in the browser or apps
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    // 8. Return the playlist text data
    return res.status(200).send(textData);

  } catch (error) {
    console.error('Proxy Fetch Error:', error);
    return res.status(500).json({ error: 'Internal Server Error while fetching the playlist.' });
  }
}
