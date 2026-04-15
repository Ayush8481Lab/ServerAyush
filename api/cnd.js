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

function getAudioQuality(itag) {
  return audioQualities[itag] || `Unknown Audio (itag: ${itag})`;
}

function getVideoQuality(itag) {
  return videoQualities[itag] || `Unknown Video (itag: ${itag})`;
}

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
  // 2. PARSE REQUEST & FETCH SIMULTANEOUSLY
  // ==========================================
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: "Missing 'id' parameter (e.g., /api/cnd?id=yThYwOixjYg)" });
  }

  const waitTimes =[5, 6, 8];
  const baseUrl = "https://serverayush.vercel.app/api/capture";
  const targetUrl = `https://inv.nadeko.net/watch?v=${id}?autoplay=1`;

  try {
    // Fire 3 requests simultaneously with different wait times
    const fetchPromises = waitTimes.map(wait => {
      // Encode URL to make sure &wait doesn't interfere with the target URL params
      const fetchUrl = `${baseUrl}?url=${encodeURIComponent(targetUrl)}&wait=${wait}`;
      return fetch(fetchUrl)
        .then(response => response.json())
        .catch(() => null); // Catch errors so one failure doesn't break Promise.all
    });

    const results = await Promise.all(fetchPromises);

    // ==========================================
    // 3. EXTRACT AND DEDUPLICATE LINKS
    // ==========================================
    let extractedData = {
      audio: {},
      video: {}
    };

    results.forEach(data => {
      // Ensure logs array exists
      if (data && data.logs && Array.isArray(data.logs)) {
        data.logs.forEach(log => {
          // Check if it's a media playback link
          if (log.url && log.url.includes('videoplayback')) {
            try {
              const urlObj = new URL(log.url);
              const itag = urlObj.searchParams.get('itag');
              const mime = urlObj.searchParams.get('mime');

              if (itag && mime) {
                // If it contains audio map to audio, if video map to video
                // Deduplicate by overwriting 'itag' keys so we don't return clones
                if (mime.includes('audio')) {
                  extractedData.audio[itag] = {
                    quality: getAudioQuality(itag),
                    url: log.url
                  };
                } else if (mime.includes('video')) {
                  extractedData.video[itag] = {
                    quality: getVideoQuality(itag),
                    url: log.url
                  };
                }
              }
            } catch (err) {
              // Ignore invalid URLs
            }
          }
        });
      }
    });

    // ==========================================
    // 4. FORMAT RESPONSE
    // ==========================================
    const finalOutput = {
      Audio: Object.values(extractedData.audio),
      Video: Object.values(extractedData.video)
    };

    // Return final JSON
    return res.status(200).json(finalOutput);

  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
