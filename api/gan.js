export default async function handler(req, res) {
  // 1. Setup CORS so you can call this API from any frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // 2. Get the search query from the URL (e.g., ?q=Dhurandhar)
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Please provide a search query using ?q=YOUR_SEARCH" });
  }

  // 3. Construct the exact Gaana API URL you found
  const targetUrl = `https://gsearch.gaana.com/vichitih/go/v2/?geoLocation=GLOBAL&query=${encodeURIComponent(query)}&content_filter=2&include=track&isRegSrch=0&webVersion=mix&rType=web&startIndex=0&usrLang=Hindi,English,Punjabi`;

  try {
    // 4. Fetch from Gaana with SPOOFED headers so they don't block us
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://gaana.com",
        "Referer": "https://gaana.com/",
      }
    });

    if (!response.ok) {
      throw new Error(`Gaana API responded with status: ${response.status}`);
    }

    // 5. Return the clean JSON back to you
    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ 
      error: "Failed to fetch data from Gaana", 
      details: error.message 
    });
  }
}
