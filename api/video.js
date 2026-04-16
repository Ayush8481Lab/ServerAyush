export default async function handler(req, res) {
  // Set CORS headers to allow requests from frontend browsers
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
    return res.status(400).json({ error: 'Video ID is required. Usage: /api/video?id=YOUR_VIDEO_ID' });
  }

  try {
    // Fetch data from the Invidious API
    const response = await fetch(`https://inv.thepixora.com/api/v1/videos/${id}`);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch video data' });
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

    // 1. Process Video with Audio (formatStreams)
    const videoWithAudio = (data.formatStreams ||[]).map(stream => ({
      Quality: stream.qualityLabel || stream.resolution || stream.quality || "Unknown",
      Size: formatSize(stream.clen),
      Link: stream.url
    }));

    const audioStreams = [];
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
