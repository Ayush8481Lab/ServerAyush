import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import crypto from 'crypto';

export default async function handler(req, res) {
  const url = req.query.url;
  const wait = req.query.wait ? parseInt(req.query.wait) : 5;

  if (!url) {
    return res.status(400).json({ error: "Please provide a URL." });
  }

  let browser = null;
  try {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const networkLogs = [];
    const generateHash = (data) => crypto.createHash('sha256').update(data).digest('hex');

    // --- ENHANCED DEEP NETWORK LISTENER ---
    page.on('response', async (response) => {
      try {
        const request = response.request();
        const resourceType = request.resourceType();
        
        // 1. Capture POST/PUT Data
        let payload = request.postData();
        
        // 2. Try to parse JSON payloads for cleaner API logs
        if (payload) {
          try {
            payload = JSON.parse(payload);
          } catch (e) {
            // If it's not JSON (e.g., form-data or plain text), keep it as a string
          }
        }

        const logEntry = {
          url: response.url(),
          method: request.method(),
          type: resourceType,
          is_api_call: (resourceType === 'fetch' || resourceType === 'xhr'), // Flag specifically for APIs
          status: response.status(),
          headers: response.headers(),
          requestPayload: payload || null, // <--- Accurately logs POST/API data
          sha256Hash: "n/a"
        };

        try { logEntry.hash = new URL(response.url()).hash; } catch (e) { logEntry.hash = ""; }

        if (response.status() < 300 || response.status() >= 400) {
          const buffer = await response.buffer().catch(() => null);
          if (buffer) {
            logEntry.sha256Hash = generateHash(buffer);
          }
        }
        networkLogs.push(logEntry);
      } catch (err) {
        // Silently skip if response is closed
      }
    });

    // Navigate and bypass
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, wait * 1000));

    // FIND AND CLICK PLAY BUTTON
    let playButtonClicked = false;
    // Common selectors for streaming sites (Update if needed for your specific site)
    const playButtonSelector = 'button[aria-label="Play"], .play-button, .vjs-big-play-button, .plyr__control--overlaid, video'; 
    
    try {
      await page.waitForSelector(playButtonSelector, { timeout: 5000 });
      await page.click(playButtonSelector);
      playButtonClicked = true;
      
      // Wait 3-5 seconds after clicking play to allow the API POST requests to fire and be captured
      await new Promise(resolve => setTimeout(resolve, 4000)); 
    } catch (e) {
      console.log("Play button not found or could not be clicked.");
    }

    const finalUrl = page.url();
    const htmlContent = await page.content();
    const pageSha256 = generateHash(htmlContent);
    let finalUrlFragment = "";
    try { finalUrlFragment = new URL(finalUrl).hash; } catch (e) { finalUrlFragment = ""; }

    await browser.close();

    // Filter to optionally just show API calls in your console (Optional debugging)
    const apiCallsWithPostData = networkLogs.filter(log => log.is_api_call && log.requestPayload);

    return res.status(200).json({
      target_url: url,
      final_url: finalUrl,
      url_fragment: finalUrlFragment,
      page_sha256Hash: pageSha256,
      waited_seconds: wait,
      play_button_clicked: playButtonClicked,
      total_requests: networkLogs.length,
      total_api_post_requests: apiCallsWithPostData.length, // Easy metric to check
      logs: networkLogs
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ 
      error: "Bypass failed or timeout", 
      details: error.message
    });
  }
}
