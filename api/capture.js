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
        '--disable-setuid-sandbox',
        '--mute-audio' // Good practice so the server doesn't hang on audio context
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

    // --- DEEP NETWORK LISTENER FOR API DATA ---
    page.on('response', async (response) => {
      try {
        const request = response.request();
        const resourceType = request.resourceType();
        
        let payload = request.postData();
        
        if (payload) {
          try {
            payload = JSON.parse(payload);
          } catch (e) {
            // Leave as string if not JSON
          }
        }

        const logEntry = {
          url: response.url(),
          method: request.method(),
          type: resourceType,
          is_api_call: (resourceType === 'fetch' || resourceType === 'xhr'),
          status: response.status(),
          headers: response.headers(),
          requestPayload: payload || null, 
          sha256Hash: "n/a"
        };

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

    // 1. OPEN THE SPOTIFY PAGE
    // Using domcontentloaded is faster, letting our custom 4-second timer take over immediately
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 2. WAIT EXACTLY 4 SECONDS AFTER OPENING
    await new Promise(resolve => setTimeout(resolve, 4000));

    // 3. FIND AND CLICK SPOTIFY PLAY BUTTON
    let playButtonClicked = false;
    
    // Spotify uses specific data-testid attributes for their play buttons
    const playButtonSelector = 'button[data-testid="play-button"], button[data-testid="control-button-playpause"], button[aria-label^="Play"]'; 
    
    try {
      // Ensure the button is present in the DOM
      await page.waitForSelector(playButtonSelector, { timeout: 3000 });
      
      // Force click via DOM evaluation. 
      // This bypasses Spotify's "Accept Cookies" banner which often blocks standard Puppeteer clicks.
      const clicked = await page.evaluate((selector) => {
        const buttons = document.querySelectorAll(selector);
        for (let btn of buttons) {
          // Check if button is actually visible on the page
          if (btn && btn.offsetParent !== null) { 
            btn.click();
            return true;
          }
        }
        // Fallback: click the very first one found if visibility check fails
        if (buttons.length > 0) {
          buttons[0].click();
          return true;
        }
        return false;
      }, playButtonSelector);

      playButtonClicked = clicked;
      
      // 4. WAIT AFTER CLICKING to allow Spotify's streaming/tracking APIs to fire
      await new Promise(resolve => setTimeout(resolve, 5000)); 

    } catch (e) {
      console.log("Spotify play button not found or failed to click:", e.message);
    }

    // Final Capture
    const finalUrl = page.url();
    
    await browser.close();

    // Optional: Filter to just show API calls to make your output cleaner
    const apiCallsWithPostData = networkLogs.filter(log => log.is_api_call && log.requestPayload);

    return res.status(200).json({
      target_url: url,
      final_url: finalUrl,
      waited_before_click: "4 seconds",
      play_button_clicked: playButtonClicked,
      total_requests: networkLogs.length,
      total_api_post_requests: apiCallsWithPostData.length,
      // You can return `apiCallsWithPostData` here instead of `networkLogs` if you ONLY want to see API bodies
      logs: networkLogs 
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ 
      error: "Scraper failed or timeout", 
      details: error.message
    });
  }
}
