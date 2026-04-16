import puppeteerCore from 'puppeteer-core';
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium-min';

// Apply the stealth plugin to puppeteer-core to bypass anti-bot protection
const puppeteer = addExtra(puppeteerCore);
puppeteer.use(StealthPlugin());

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

  // Force Vercel API network to NEVER cache this response
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
    // CORRECTED URL: Added .x64 to the tar file name to fix the 404 error
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      args:[...chromium.args, '--incognito'],
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

    // Send CDP Commands to wipe any lingering network cache
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCache');
    await client.send('Network.clearBrowserCookies');

    // Delete the Service Worker API so Cloudflare/Site cannot use offline cache
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
    });

    // We DO NOT block scripts/iframes here because Cloudflare's JS challenge requires them to pass.
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      // Only block media and images to save memory, allow JS/document/fonts for Cloudflare
      if (['image', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

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
    }, { timeout: 25000 }).catch(() => {}); // Wait up to 25 seconds for the challenge

    // Extract the raw text from the page
    const content = await page.evaluate(() => document.body.innerText);

    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      // If we still can't parse it, Cloudflare blocked us completely
      if (browser) await browser.close();
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
