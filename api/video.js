export default async function handler(req, res) {
  // Set CORS headers to allow requests from your frontend
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { id } = req.query;

  // Check if ID is provided
  if (!id) {
    return res.status(400).json({ error: 'Video ID is required. Usage: /api/video?id=VIDEO_ID' });
  }

  const targetUrl = `https://inv.thepixora.com/api/v1/videos/${id}`;

  // Extensive headers to spoof a real Chrome browser and bypass Cloudflare 403 Forbidden
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://inv.thepixora.com/',
    'Origin': 'https://inv.thepixora.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0'
  };

  try {
    const response = await fetch(targetUrl, { headers, method: 'GET' });

    // Check if Cloudflare is still blocking the request
    if (response.status === 403) {
      return res.status(403).json({ 
        error: 'Cloudflare blocked the request (403 Forbidden). The API requires a Javascript challenge.' 
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: `API request failed with status: ${response.status}` });
    }

    const data = await response.json();

    // Helper function to format bytes into readable MB
    const formatSize = (bytes) => {
      if (!bytes) return "Unknown";
      const mb = (parseInt(bytes, 10) / (1024 * 1024)).toFixed(2);
      return `${mb} MB`;
    };

    // Helper function to clean up audio quality strings (e.g., AUDIO_QUALITY_MEDIUM -> Medium)
    const formatAudioQuality = (q, sampleRate) => {
      if (q) {
        const cleaned = q.replace('AUDIO_QUALITY_', '').toLowerCase();
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
      if (sampleRate) return `${sampleRate / 1000} kHz`;
      return "Unknown";
    };

    // 1. Process Video with Audio
    const videoWithAudio = (data.formatStreams ||[]).map(stream => ({
      Quality: stream.qualityLabel || stream.resolution || stream.quality || "Unknown",
      Size: formatSize(stream.clen),
      Link: stream.url
    }));

    const audioStreams =[];
    const videoStreams =[];

 // 2. Process Adaptive Formats (Separating Audio-only and Video-only)
    (data.adaptiveFormats ||[]).forEach(stream => {
      if (stream.type && stream.type.startsWith('audio/')) {
        audioStreams.push({
          Quality: formatAudioQuality(stream.audioQuality, stream.audioSampleRate),
          Size: formatSize(stream.clen),
          Link: stream.url
        });
      } else if (stream.type && stream.type.startsWith('video/')) {
        videoStreams.push({
          Quality: stream.qualityLabel || stream.resolution || "Unknown",
          Size: formatSize(stream.clen),
          Link: stream.url
        });
      }
    });

    // 3. Return the formatted JSON response
    res.status(200).json({
      "Video with audio": videoWithAudio,
      "Audio": audioStreams,
      "Video": videoStreams
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
