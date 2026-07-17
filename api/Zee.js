export default async function handler(req, res) {
    // 1. Enable Open CORS so you can play this on your own app/domain
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, User-Agent');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. Get the target URL from the query parameter
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Missing "url" parameter. Please provide a stream URL.' });
    }

    try {
        // 3. SPOOF HEADERS: This is what bypasses the "direct browser access blocked"
        const fetchHeaders = {
            'Referer': 'https://allinonereborn2.online/sony/ptest1.html?id=sony-ten-3',
            'Origin': 'https://allinonereborn2.online',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'X-Requested-With': 'XMLHttpRequest', // Tricks PHP into thinking this is a JS fetch
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Connection': 'keep-alive'
        };

        // 4. Fetch the target URL
        const response = await fetch(url, {
            method: 'GET',
            headers: fetchHeaders,
        });

        if (!response.ok) {
            return res.status(response.status).send(`Upstream Error: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        res.setHeader('Content-Type', contentType || 'application/vnd.apple.mpegurl');

        // 5. Handle M3U8 Playlist Parsing
        if (url.includes('.m3u8') || (contentType && contentType.includes('mpegurl'))) {
            let m3u8Data = await response.text();

            // Setup the base path and proxy path for rewriting inner links
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            // Replace 'your-vercel-domain' dynamically with the actual host executing the script
            const proxyUrl = `https://${req.headers.host}/api/proxy?url=`;

            // Rewrite inner .ts and .m3u8 links so they also route through this proxy!
            let rewrittenM3u8 = m3u8Data.split('\n').map(line => {
                line = line.trim();
                // Ignore comments/tags
                if (!line || line.startsWith('#')) {
                    return line;
                }
                // If it's already an absolute URL (starts with http)
                if (line.startsWith('http')) {
                    return proxyUrl + encodeURIComponent(line);
                }
                // If it's a relative URL, attach it to the base upstream URL
                return proxyUrl + encodeURIComponent(baseUrl + line);
            }).join('\n');

            return res.status(200).send(rewrittenM3u8);
        } 
        
        // 6. Handle raw Video Chunks (.ts)
        else {
            const arrayBuffer = await response.arrayBuffer();
            return res.status(200).send(Buffer.from(arrayBuffer));
        }

    } catch (error) {
        console.error('Proxy Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
