// ==========================================
// YOUTUBE ITAG DICTIONARIES (Up to 8K)
// ==========================================
const audioQualities = {
  '139': '48kbps M4A',
  '140': '128kbps M4A',
  '141': '256kbps M4A',
  '249': '50kbps WebM',
  '250': '70kbps WebM',
  '251': '160kbps WebM'
};

const muxedQualities = { // Video + Audio Combined
  '17': '144p 3GP',
  '18': '360p MP4',
  '22': '720p MP4'
};

const videoQualities = { // Video Only
  // AVC / MP4
  '133': '240p MP4',
  '134': '360p MP4',
  '135': '480p MP4',
  '136': '720p MP4',
  '137': '1080p MP4',
  '264': '1440p MP4',
  '266': '2160p MP4 (4K)',
  '298': '720p60 MP4',
  '299': '1080p60 MP4',
  
  // WebM / VP9
  '160': '144p WebM',
  '278': '144p WebM',
  '242': '240p WebM',
  '243': '360p WebM',
  '244': '480p WebM',
  '247': '720p WebM',
  '248': '1080p WebM',
  '271': '1440p WebM',
  '313': '2160p WebM (4K)',
  '272': '4320p WebM (8K)',
  '302': '720p60 WebM',
  '303': '1080p60 WebM',
  '308': '1440p60 WebM',
  '315': '2160p60 WebM',
  
  // AV1
  '394': '144p AV1',
  '395': '240p AV1',
  '396': '360p AV1',
  '397': '480p AV1',
  '398': '720p AV1',
  '399': '1080p AV1',
  '400': '1440p AV1',
  '401': '2160p AV1 (4K)',
  '402': '4320p AV1 (8K)',
  '571': '4320p60 AV1 (8K)'
};

// Helper: Extract content length (clen) and format as MB
const formatSize = (url) => {
  try {
    const clen = new URL(url).searchParams.get('clen');
    if (clen) {
      const mb = parseInt(clen, 10) / (1024 * 1024);
      return `${mb.toFixed(2)} MB`;
    }
  } catch (err) {
    // Ignore invalid URL parse errors
  }
  return 'Unknown';
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

  // Handle Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ==========================================
  // 2. PARSE REQUEST
  // ==========================================
  const { id, v } = req.query; // Capture 'v' param
  if (!id) {
    return res.status(400).json({ error: "Missing 'id' parameter (e.g., /api/cnd?id=yThYwOixjYg)" });
  }

  const baseUrl = "https://serverayush.vercel.app/api/capture";

  let manifestUrl = null;
  let rawVideoplaybackUrls =[]; 
  let checkParam = null;
  let compHost = null;

  // ==========================================
  // 3. AUTO-RETRY LOGIC (UP TO 20 SECONDS)
  // ==========================================
  const startTime = Date.now();
  const maxRetryTime = 20000; // 20 seconds
  
  while (Date.now() - startTime < maxRetryTime) {
    let fetchPromises =[];

    if (v === '2') {
      // VERSION 2: Fire 5 requests simultaneously with wait=0 using new domain
      const targetUrl = `https://yt.chocolatemoo53.com/watch?v=${id}`;
      fetchPromises = Array.from({ length: 5 }, () => {
        const fetchUrl = `${baseUrl}?url=${encodeURIComponent(targetUrl)}&wait=0`;
        return fetch(fetchUrl).then(response => response.json()).catch(() => null);
      });
    } else {
      // VERSION 1 (Default): Old domain, delays: [3, 4, 5, 6, 8]
      const targetUrl = `https://inv.nadeko.net/watch?v=${id}?autoplay=1`;
      const waitTimes =[3, 4, 5, 6, 8];
      fetchPromises = waitTimes.map(wait => {
        const fetchUrl = `${baseUrl}?url=${encodeURIComponent(targetUrl)}&wait=${wait}`;
        return fetch(fetchUrl).then(response => response.json()).catch(() => null);
      });
    }

    const results = await Promise.all(fetchPromises);

    // Scan logs for manifest and standalone videoplayback URLs
    for (const data of results) {
      if (data && data.logs && Array.isArray(data.logs)) {
        for (const log of data.logs) {
          if (log.url) {
            // Find DASH manifest and extract the host and 'check' parameter
            if (log.url.includes('/api/manifest/dash/id/')) {
              manifestUrl = log.url;
              try {
                const mUrlObj = new URL(manifestUrl);
                checkParam = mUrlObj.searchParams.get('check');
                compHost = mUrlObj.origin; // e.g. https://yt-comp6.chocolatemoo53.com
              } catch (e) { /* ignore parse error */ }
            }
            // Find regular media streams
            if (log.url.includes('videoplayback')) {
              rawVideoplaybackUrls.push(log.url);
            }
          }
        }
      }
    }

    // If we found the manifest, we can stop retrying!
    if (manifestUrl) break;

    // Wait 1 second before retrying to prevent spamming your API
    if (Date.now() - startTime < maxRetryTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Check if we ultimately failed after 20 seconds
  if (!manifestUrl) {
    return res.status(404).json({ error: "Could not find DASH manifest (.bin) after retrying for 20 seconds." });
  }

  // ==========================================
  // 4. PROCESS NETWORK LOGS & DASH MANIFEST
  // ==========================================
  try {
    let extractedData = {
      audio: {},
      video: {},
      videoWithAudio: {}
    };

    // --- A. Process regular logs for "Video With Audio" (itag 18, 22) ---
    rawVideoplaybackUrls.forEach(url => {
      try {
        const urlObj = new URL(url);
        const itag = urlObj.searchParams.get('itag');
        if (itag && muxedQualities[itag]) {
          extractedData.videoWithAudio[itag] = {
            quality: muxedQualities[itag],
            size: formatSize(url),
            url: url
          };
        }
      } catch (err) { /* ignore invalid URLs */ }
    });

    // --- B. Fetch the DASH .bin file ---
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      return res.status(500).json({ error: "Found manifest URL, but failed to download the XML data." });
    }
    const manifestXml = await manifestResponse.text();
    const domain = new URL(manifestUrl).origin; // Base domain for relative links

    // Regex to extract `<Representation id="140" ...> ... <BaseURL>url...</BaseURL>`
    const representationRegex = /<Representation\s+(?:[^>]*\s+)?id="([a-zA-Z0-9-]+)"[^>]*>[\s\S]*?<BaseURL>(.*?)<\/BaseURL>/gi;
    let match;

    while ((match = representationRegex.exec(manifestXml)) !== null) {
      const rawItag = match[1]; // e.g., "140" or "140-drc"
      const baseItag = rawItag.split('-')[0]; // Extract pure number (e.g., "140")
      let relativeUrl = match[2];

      // Clean up XML-encoded characters
      relativeUrl = relativeUrl.replace(/&amp;/g, '&')
                               .replace(/&lt;/g, '<')
                               .replace(/&gt;/g, '>')
                               .replace(/&quot;/g, '"')
                               .replace(/&apos;/g, "'");

      // Construct absolute URL
      const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : domain + relativeUrl;
      const isStableVolume = rawItag.includes('drc') ? ' (Stable Volume)' : '';
      const streamSize = formatSize(fullUrl);

      // Categorize extracted link
      if (audioQualities[baseItag]) {
        extractedData.audio[rawItag] = {
          quality: audioQualities[baseItag] + isStableVolume,
          size: streamSize,
          url: fullUrl
        };
      } else if (videoQualities[baseItag]) {
        extractedData.video[rawItag] = {
          quality: videoQualities[baseItag] + isStableVolume,
          size: streamSize,
          url: fullUrl
        };
      } else if (muxedQualities[baseItag]) {
        extractedData.videoWithAudio[rawItag] = {
          quality: muxedQualities[baseItag] + isStableVolume,
          size: streamSize,
          url: fullUrl
        };
      }
    }

    // --- C. V2 EXCLUSIVE: Generate & Resolve Redirect Links ---
    if (v === '2' && checkParam && compHost) {
      
      // Helper to fetch the redirect target to get the final videoplayback URL
      const getRedirectUrl = async (itag) => {
        const redirectUrl = `${compHost}/companion/latest_version?id=${id}&itag=${itag}&check=${checkParam}`;
        try {
          // A standard GET request. Fetch auto-follows 302 redirects 
          // returning the resolved final destination URL inside `res.url`.
          const res = await fetch(redirectUrl, { method: 'GET', redirect: 'follow' });
          if (res.url && res.url.includes('videoplayback')) {
            return res.url;
          }
        } catch (e) { /* ignore network error on redirect tracking */ }
        return null;
      };

      // Try for standard 360p combined stream
      const itag18Url = await getRedirectUrl('18');
      if (itag18Url) {
        extractedData.videoWithAudio['18'] = {
          quality: muxedQualities['18'],
          size: formatSize(itag18Url),
          url: itag18Url
        };
      }

      // Try for standard 720p combined stream (if available)
      const itag22Url = await getRedirectUrl('22');
      if (itag22Url) {
        extractedData.videoWithAudio['22'] = {
          quality: muxedQualities['22'],
          size: formatSize(itag22Url),
          url: itag22Url
        };
      }
    }

    // ==========================================
    // 5. FORMAT FINAL RESPONSE
    // ==========================================
    const finalOutput = {
      VideoWithAudio: Object.values(extractedData.videoWithAudio),
      Audio: Object.values(extractedData.audio),
      Video: Object.values(extractedData.video)
    };

    return res.status(200).json(finalOutput);

  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
