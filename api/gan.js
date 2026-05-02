export default async function handler(req, res) {
  // 1. Setup CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Please provide a search query using ?q=YOUR_SEARCH" });
  }

  // TARGET API: We are using Gaana's Mobile App V1 API. 
  // It provides the exact same data but bypasses their strict Web CloudFront WAF.
  const targetUrl = `https://api.gaana.com/index.php?type=search&subtype=search_song&key=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        // Standard Browser Headers
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://gaana.com",
        "Referer": "https://gaana.com/",
        
        // CRUCIAL BYPASS: Gaana-specific security headers found in your logs
        "deviceId": "841f9afd-387f-44d9-bea7-b770a886ef50", // Spoofed valid device ID
        "deviceType": "GaanaWebsiteApp",
        "Cookie": "deviceId=841f9afd-387f-44d9-bea7-b770a886ef50; deviceType=GaanaWebsiteApp;"
      }
    });

    // 2. Fetch the raw text FIRST to prevent the "Unexpected end of JSON input" crash
    const text = await response.text();

    // 3. Security Check: Did Gaana block us or return an empty body?
    if (!response.ok) {
      return res.status(response.status).json({ 
        error: "Gaana blocked the request (WAF)", 
        raw_response: text 
      });
    }

    if (!text || text.trim() === "") {
      return res.status(500).json({ 
        error: "Gaana shadow-banned the request. Returned 0 bytes of data." 
      });
    }

    // 4. Safely parse and return the JSON
    const data = JSON.parse(text);
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ 
      error: "JSON Parsing Failed", 
      details: error.message 
    });
  }
}
