import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium-min';

// Apply the stealth plugin to bypass anti-bot protection
puppeteer.use(StealthPlugin());

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
  let browser = null;

  try {
    // Because you are using the minified Sparticuz, we MUST pass the URL to the Chromium pack.
    // Sparticuz will download this file to /tmp during the cold start.
    // NOTE: If you experience GitHub rate limiting in production, host this .tar file on an S3 bucket and use your own URL!
    const chromiumPackUrl = 'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.tar';

    // Launch headless Chromium customized for serverless/constrained environments
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(chromiumPackUrl), // <-- FIX IS HERE
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // Navigate to the URL
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Cloudflare will likely show a challenge page first. 
    // We wait until the page's body contains valid JSON, which means the challenge has passed.
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      try {
        JSON.parse(text); // If this succeeds, it means Cloudflare redirected to the real JSON API
        return true;
      } catch (e) {
        return false;
      }
    }, { timeout: 20000 }).catch(() => {}); // Wait up to 20 seconds for the challenge

    // Extract the raw text from the page
    const content = await page.evaluate(() => document.body.innerText);

    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      // If we still can't parse it, Cloudflare blocked us completely
      return res.status(403).json({ 
        error: 'Cloudflare blocked the request or the challenge timed out.',
        raw_response: content.substring(0, 300) 
      });
    }

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
