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
  // 3. AUTO-RETRY & EARLY EXIT LOGIC (15 SECONDS)
  // ==========================================
  const startTime = Date.now();
  const maxRetryTime = 15000; // 15 seconds
  
  while (Date.now() - startTime < maxRetryTime) {
    let waits = v === '1' ? [5, 5, 5, 7, 7] :[0, 0, 0, 0, 0];
    let targetUrl = v === '1' 
      ? `https://inv.nadeko.net/watch?v=${id}?autoplay=1` 
      : `https://yt.chocolatemoo53.com/watch?v=${id}`;

    // FAST LATENCY: We await a custom promise that resolves IMMEDIATELY the moment
    // any of the 5 concurrent requests finds the manifestUrl.
    await new Promise((resolve) => {
      let resolvedCount = 0;
      waits.forEach(wait => {
        const fetchUrl = `${baseUrl}?url=${encodeURIComponent(targetUrl)}&wait=${wait}`;
        fetch(fetchUrl)
          .then(response => response.json())
          .then(data => {
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
          })
          .catch(() => null)
          .finally(() => {
            resolvedCount++;
            // Early Exit condition: If we found manifestUrl OR all requests completed
            if (manifestUrl || resolvedCount === waits.length) {
              resolve();
            }
          });
      });
    });

    // If we found the manifest via the early exit logic, break out of retry loop!
    if (manifestUrl) break;

    // Wait 1 second before retrying to prevent spamming your API
    if (Date.now() - startTime < maxRetryTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Check if we ultimately failed after 15 seconds
  if (!manifestUrl) {
    return res.status(404).json({ error: "Could not find DASH manifest (.bin) after retrying for 15 seconds." });
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
    
    let extractedItags = new Set(); // Tracks successfully parsed itags
    let aitagsList = new Set();     // Tracks all available itags found in URLs

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
          extractedItags.add(itag);
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

      // Track the itag we just extracted
      extractedItags.add(baseItag);

      // Look for the `aitags` parameter to discover missing formats (like 400, 401)
      if (fullUrl.includes('aitags=')) {
        try {
          const uObj = new URL(fullUrl);
          const aitagsStr = uObj.searchParams.get('aitags');
          if (aitagsStr) {
            aitagsStr.split(',').forEach(t => aitagsList.add(t));
          }
        } catch (e) { /* ignore parse error */ }
      }

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

    // --- C. DYNAMIC AITAGS RESOLVER (Fetch missing High-Res/Muxed streams concurrently) ---
    if (v === '2' && checkParam && compHost) {
      // Force addition of standard 18 and 22 into aitagsList to try to fetch them natively
      aitagsList.add('18');
      aitagsList.add('22');

      // Identify which itags we know about but haven't successfully loaded yet
      const missingItags = Array.from(aitagsList).filter(itag => !extractedItags.has(itag));
      
      // Filter out weird or unsupported itags to avoid wasteful requests
      const validMissingItags = missingItags.filter(itag => 
        audioQualities[itag] || videoQualities[itag] || muxedQualities[itag]
      );

      // Fetch all missing itags concurrently to keep latency at absolute minimum
      const missingItagPromises = validMissingItags.map(async (itag) => {
        const redirectUrl = `${compHost}/companion/latest_version?id=${id}&itag=${itag}&check=${checkParam}`;
        try {
          // fetch() natively follows standard 302 redirects 
          const res = await fetch(redirectUrl, { method: 'GET', redirect: 'follow' });
          if (res.url && res.url.includes('videoplayback')) {
            const streamSize = formatSize(res.url);

            if (audioQualities[itag]) {
              extractedData.audio[itag] = { quality: audioQualities[itag], size: streamSize, url: res.url };
            } else if (videoQualities[itag]) {
              extractedData.video[itag] = { quality: videoQualities[itag], size: streamSize, url: res.url };
            } else if (muxedQualities[itag]) {
              extractedData.videoWithAudio[itag] = { quality: muxedQualities[itag], size: streamSize, url: res.url };
            }
          }
        } catch (e) { /* ignore network errors for isolated fallback fetches */ }
      });

      await Promise.all(missingItagPromises);
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
