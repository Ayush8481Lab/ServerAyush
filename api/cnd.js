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
  const { id, v, lis } = req.query; // Capture 'v' and 'lis' params
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
    let waits = v === '1' ?[5, 5, 5, 7, 7] :[0, 0, 0, 0, 0];
    let targetUrl = v === '1' 
      ? `https://inv.nadeko.net/watch?v=${id}?autoplay=1` 
      : `https://yt.chocolatemoo53.com/watch?v=${id}`;

    // FAST LATENCY: Resolve IMMEDIATELY the moment ANY concurrent request finds the manifestUrl.
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
                  // Find DASH manifest and extract host & 'check' parameter
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
            // Early Exit condition
            if (manifestUrl || resolvedCount === waits.length) {
              resolve();
            }
          });
      });
    });

    if (manifestUrl) break; // Break out of retry loop if found

    // Wait 1 second before retrying
    if (Date.now() - startTime < maxRetryTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

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
    
    let extractedItags = new Set(); 
    let aitagsList = new Set();     

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

    // --- B. PARSE DASH MANIFEST TASK ---
    const manifestTask = async () => {
      const manifestResponse = await fetch(manifestUrl);
      if (!manifestResponse.ok) return;
      
      const manifestXml = await manifestResponse.text();
      const domain = new URL(manifestUrl).origin;
      const representationRegex = /<Representation\s+(?:[^>]*\s+)?id="([a-zA-Z0-9-]+)"[^>]*>[\s\S]*?<BaseURL>(.*?)<\/BaseURL>/gi;
      let match;

      while ((match = representationRegex.exec(manifestXml)) !== null) {
        const rawItag = match[1];
        const baseItag = rawItag.split('-')[0];
        let relativeUrl = match[2];

        relativeUrl = relativeUrl.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        const fullUrl = relativeUrl.startsWith('http') ? relativeUrl : domain + relativeUrl;
        
        const isStableVolume = rawItag.includes('drc') ? ' (Stable Volume)' : '';
        const streamSize = formatSize(fullUrl);

        extractedItags.add(baseItag);

        if (fullUrl.includes('aitags=')) {
          try {
            const uObj = new URL(fullUrl);
            const aitagsStr = uObj.searchParams.get('aitags');
            if (aitagsStr) aitagsStr.split(',').forEach(t => aitagsList.add(t));
          } catch (e) {}
        }

        if (audioQualities[baseItag]) {
          extractedData.audio[rawItag] = { quality: audioQualities[baseItag] + isStableVolume, size: streamSize, url: fullUrl };
        } else if (videoQualities[baseItag]) {
          extractedData.video[rawItag] = { quality: videoQualities[baseItag] + isStableVolume, size: streamSize, url: fullUrl };
        } else if (muxedQualities[baseItag]) {
          extractedData.videoWithAudio[rawItag] = { quality: muxedQualities[baseItag] + isStableVolume, size: streamSize, url: fullUrl };
        }
      }
    };

    // --- C. LIS=TRUE CUSTOM AUDIO RESOLVER TASK ---
    let lisResults =[];
    const lisTask = async () => {
      if (lis === 'true' && checkParam && compHost) {
        // Defined custom mapping for LIS requests
        const lisItags =[
          { itag: '251', quality: 'High' },
          { itag: '140', quality: 'Medium' },
          { itag: '250', quality: 'Low' }
        ];
        
        await Promise.all(lisItags.map(async ({ itag, quality }) => {
          // Add local=true specifically if v=1
          const localParam = v === '1' ? '&local=true' : '';
          const redirectUrl = `${compHost}/companion/latest_version?id=${id}&itag=${itag}${localParam}&check=${checkParam}`;
          try {
            const res = await fetch(redirectUrl, { method: 'GET', redirect: 'follow' });
            if (res.url && res.url.includes('videoplayback')) {
              lisResults.push({
                itag,
                quality,
                size: formatSize(res.url),
                url: res.url
              });
            }
          } catch (e) { /* ignore network error */ }
        }));
      }
    };

    // Run both Manifest Download/Parsing AND LIS Fetches simultaneously for zero added latency!
    await Promise.all([manifestTask().catch(() => {}), lisTask().catch(() => {})]);

    // --- D. DYNAMIC AITAGS RESOLVER (Fetch missing High-Res/Muxed streams concurrently) ---
    if (v === '2' && checkParam && compHost) {
      aitagsList.add('18');
      aitagsList.add('22');

      const missingItags = Array.from(aitagsList).filter(itag => !extractedItags.has(itag));
      
      // Filter logic: Check if it's a valid known quality
      const validMissingItags = missingItags.filter(itag => {
        // If lis=true, skip 2K, 4K, 8K to save latency
        if (lis === 'true') {
          const q = videoQualities[itag] || '';
          if (q.includes('1440p') || q.includes('2160p') || q.includes('4320p') || q.includes('4K') || q.includes('8K')) {
            return false;
          }
        }
        return audioQualities[itag] || videoQualities[itag] || muxedQualities[itag];
      });

      const missingItagPromises = validMissingItags.map(async (itag) => {
        const localParam = v === '1' ? '&local=true' : '';
        const redirectUrl = `${compHost}/companion/latest_version?id=${id}&itag=${itag}${localParam}&check=${checkParam}`;
        try {
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
        } catch (e) { /* ignore */ }
      });

      await Promise.all(missingItagPromises);
    }

    // ==========================================
    // 5. FORMAT FINAL RESPONSE
    // ==========================================
    const finalOutput = {
      VideoWithAudio: Object.values(extractedData.videoWithAudio),
      Audio:[],
      Video: Object.values(extractedData.video)
    };

    // If lis=true was passed, process the custom Audio array sorting
    if (lis === 'true') {
      // 1. Sort custom requested itags by priority
      const lisOrder = { '251': 1, '140': 2, '250': 3 };
      lisResults.sort((a, b) => (lisOrder[a.itag] || 99) - (lisOrder[b.itag] || 99));

      const lisFetchedItags = new Set();
      lisResults.forEach(item => {
        finalOutput.Audio.push({
          quality: item.quality,
          size: item.size,
          url: item.url
        });
        lisFetchedItags.add(item.itag);
      });

      // 2. Add remaining manifest audio (excluding the duplicates we just fetched) labeled as Default
      Object.entries(extractedData.audio).forEach(([rawItag, data]) => {
        const baseItag = rawItag.split('-')[0];
        if (!lisFetchedItags.has(baseItag)) {
          finalOutput.Audio.push({
            quality: `Default - ${data.quality}`,
            size: data.size,
            url: data.url
          });
        }
      });
    } else {
      // Standard behavior
      finalOutput.Audio = Object.values(extractedData.audio);
    }

    return res.status(200).json(finalOutput);

  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
