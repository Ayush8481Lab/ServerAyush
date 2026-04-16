import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  // --- START CORS CONFIGURATION ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  // --- END CORS CONFIGURATION ---

  // Force API network to NEVER cache this response
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { id } = req.query;

  // Check if ID is provided
  if (!id) {
    return res.status(400).json({ error: 'Video ID is required. Usage: /api/video?id=VIDEO_ID' });
  }

  const targetUrl = `https://inv.thepixora.com/api/v1/videos/${id}`;
  let browser = null;

  try {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      args: [...chromium.args, '--incognito'],
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true,
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    // Disable cache
    await page.setCacheEnabled(false);
    await page.setBypassServiceWorker(true);

    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCache');
    await client.send('Network.clearBrowserCookies');

    // =======================================================================
    // MANUAL STEALTH BYPASS: Replaces puppeteer-extra-plugin-stealth entirely
    // =======================================================================
    
    // 1. Spoof a real Windows Chrome User-Agent (Removes "Headless")
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    
    // 2. Inject fake browser variables to fool Cloudflare's JS Challenge
    await page.evaluateOnNewDocument(() => {
      // Overwrite webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      
      // Delete ServiceWorker to stop Site/Cloudflare offline caching
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
      
      // Mock window.chrome
      window.chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };
      
      // Mock plugins and languages
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      
      // Mock permissions (Cloudflare sometimes checks this)
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });
    // =======================================================================

    // We DO NOT block JS/CSS here because Cloudflare's JS challenge requires them.
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      // Only block media and images to save memory
      if (['image', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Add a timestamp cache-buster so Cloudflare executes fresh
    const finalUrl = targetUrl.includes('?') ? `${targetUrl}&_cb=${Date.now()}` : `${targetUrl}?_cb=${Date.now()}`;

    // Navigate to the URL
    await page.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait until the page's body contains valid JSON, meaning the challenge has passed.
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      try {
        JSON.parse(text); 
        return true;
      } catch (e) {
        return false;
      }
    }, { timeout: 25000 }).catch(() => {}); // Wait up to 25 seconds for the challenge

    // Extract the raw text from the page
    const content = await page.evaluate(() => document.body.innerText);

    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      if (browser) await browser.close();
      return res.status(403).json({ 
        error: 'Cloudflare blocked the request or the challenge timed out.',
        raw_response: content.substring(0, 300) 
      });
    }

    // Close the browser to free up memory
    if (browser) await browser.close();
    browser = null;

    // Helper function to format bytes into readable MB
    const formatSize = (bytes) => {
      if (!bytes) return "Unknown";
      const mb = (parseInt(bytes, 10) / (1024 * 1024)).toFixed(2);
      return `${mb} MB`;
    };

    // Helper function to clean up audio quality strings
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
