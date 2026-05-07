export default async function handler(req, res) {
  // 1. Get the keyword from the URL query
  const keyword = req.query.keyword;

  if (!keyword) {
    return res.status(400).json({ 
      error: "Keyword is required. Example: /api/search?keyword=despacito" 
    });
  }

  // 2. Build the original Gaana URL
  const targetUrl = `https://gaana.com/apiv2?country=IN&page=0&secType=track&type=search&keyword=${encodeURIComponent(keyword)}`;

  // 3. Generate a random Indian IP to hide that we are using Vercel
  const prefixes =['14.96.', '27.54.', '43.224.', '49.14.', '103.27.'];
  const randomIp = `${prefixes[Math.floor(Math.random() * prefixes.length)]}${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

  try {
    // 4. Fetch the data mimicking a real Chrome Browser
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://gaana.com',
        'Referer': 'https://gaana.com/',
        'X-Forwarded-For': randomIp,
        'X-Real-IP': randomIp
      }
    });

    // 5. Read as raw text first (prevents crashes if Gaana sends empty block page)
    const rawText = await response.text();

    if (!response.ok || !rawText) {
      return res.status(500).json({ 
        success: false, 
        error: "Blocked by Gaana", 
        details: rawText || "Empty Response" 
      });
    }

    // 6. Parse the original JSON
    const gaanaData = JSON.parse(rawText);

    // 7. Cache the response for 60 seconds (makes your API super fast)
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    
    // 8. Return the EXACT original response from Gaana
    return res.status(200).json(gaanaData);

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: "Server Error", 
      message: error.message 
    });
  }
}
