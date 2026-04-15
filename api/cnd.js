// YouTube itag mappings to readable qualities
const audioQualities = {
  '139': '48kbps M4A',
  '140': '128kbps M4A',
  '141': '256kbps M4A',
  '249': '50kbps WebM',
  '250': '70kbps WebM',
  '251': '160kbps WebM'
};

const videoQualities = {
  '18': '360p (Video + Audio)',
  '22': '720p (Video + Audio)',
  '133': '240p',
  '134': '360p',
  '135': '480p',
  '136': '720p',
  '137': '1080p',
  '160': '144p',
  '298': '720p60',
  '299': '1080p60',
  '278': '144p WebM',
  '242': '240p WebM',
  '243': '360p WebM',
  '244': '480p WebM',
  '247': '720p WebM',
  '248': '1080p WebM',
  '302': '720p60 WebM',
  '303': '1080p60 WebM',
  '394': '144p AV1',
  '395': '240p AV1',
  '396': '360p AV1',
  '397': '480p AV1',
  '398': '720p AV1',
  '399': '1080p AV1'
};

export default async function handler(req, res) {
  // ==========================================
  // 1. ALLOW CORS
  // ==========================================
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle Preflight Request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==========================================
  // 2. PARSE REQUEST & FETCH LOGS SIMULTANEOUSLY
  // ==========================================
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: "Missing 'id' parameter (e.g., /api/cnd?id=yThYwOixjYg)" });
  }

  const waitTimes = [3, 4]; // Updated to use only 3 and 4
  const baseUrl = "https://serverayush.vercel.app/api/capture";
  const targetUrl = `https://inv.nadeko.net/watch?v=${id}?autoplay=1`;

  try {
    // Fire 2 requests simultaneously
    const fetchPromises = waitTimes.map(wait => {
      const fetchUrl = `${baseUrl}?url=${encodeURIComponent(targetUrl)}&wait=${wait}`;
      return fetch(fetchUrl)
        .then(response => response.json())
        .catch(() => null); // Catch errors individually
    });

    const results = await Promise.all(fetchPromises);

    // ==========================================
    // 3. FIND DASH MANIFEST URL FROM LOGS
    // ==========================================
    let manifestUrl = null;

    for (const data of results) {
      if (data && data.logs && Array.isArray(data.logs)) {
        for (const log of data.logs) {
          if (log.url && log.url.includes('/api/manifest/dash/id/')) {
            manifestUrl = log.url;
            break; // Found the target URL, break inner loop
          }
        }
      }
      if (manifestUrl) break; // Break outer loop if found
    }

    if (!manifestUrl) {
      return res.status(404).json({ error: "Could not find DASH manifest (.bin) URL in network logs." });
    }

    // ==========================================
    // 4. FETCH AND PARSE THE XML MANIFEST
    // ==========================================
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      return res.status(500).json({ error: "Failed to fetch the DASH manifest XML data." });
    }
    const manifestXml = await manifestResponse.text();

    // Extract the origin domain (e.g., https://inv-us5.nadeko.net)
    const domain = new URL(manifestUrl).origin;

    let extractedData = {
      audio: {},
      video: {}
    };

    // Regex to extract `<Representation id="140" ...> ... <BaseURL>url...</BaseURL>`
    // Supports ids with letters (like "140-drc" for Stable Volume)
    const representationRegex = /<Representation\s+(?:[^>]*\s+)?id="([a-zA-Z0-9-]+)"[^>]*>[\s\S]*?<BaseURL>(.*?)<\/BaseURL>/gi;
    let match;

    while ((match = representationRegex.exec(manifestXml)) !== null) {
      const rawItag = match[1]; // e.g. "140" or "140-drc"
      const baseItag = rawItag.split('-')[0]; // Gets the pure itag number (e.g., "140")
      let relativeUrl = match[2];

      // Decode XML encoded characters (like &amp; to &)
      relativeUrl = relativeUrl.replace(/&amp;/g, '&')
                               .replace(/&lt;/g, '<')
                               .replace(/&gt;/g, '>')
                               .replace(/&quot;/g, '"')
                               .replace(/&apos;/g, "'");

      // Construct final URL using the same domain
      const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : domain + relativeUrl;

      // Group into Audio or Video based on the pure itag number
      if (audioQualities[baseItag]) {
        const qualityName = audioQualities[baseItag];
        extractedData.audio[rawItag] = {
          quality: rawItag.includes('drc') ? `${qualityName} (Stable Volume)` : qualityName,
          url: fullUrl
        };
      } else if (videoQualities[baseItag]) {
        const qualityName = videoQualities[baseItag];
        extractedData.video[rawItag] = {
          quality: rawItag.includes('drc') ? `${qualityName} (Stable Volume)` : qualityName,
          url: fullUrl
        };
      }
    }

    // ==========================================
    // 5. FORMAT FINAL RESPONSE
    // ==========================================
    const finalOutput = {
      Audio: Object.values(extractedData.audio),
      Video: Object.values(extractedData.video)
    };

    return res.status(200).json(finalOutput);

  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
