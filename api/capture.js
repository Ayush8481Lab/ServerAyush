import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import crypto from 'crypto';

export default async function handler(req, res) {
  // =========================================================
  // 1. CONFIGURATION: PASTE YOUR COOKIE & SELECTORS HERE
  // =========================================================
  
  // Paste your Spotify sp_dc cookie value inside the quotes below:
  const SP_DC_COOKIE_VALUE = "AQD05MKcMMPTA8l694-m7vEqCJh1IQ6qTFf7F93KsWhBFPHGYUw4DAxzdn9cLxnFcQjQl3GlI6mXtKwAq-drF4V--kcmVILwCKn1FX5mNtC23OtS3PaMobhGjYuHpQF9F-6Fty91MFjRVr6F0IW83eOQgPx-pC5XdYE4oZn55uaIZLClm01UhvzqA3dGw0IrFilH6zeCZ77FTtJgp-X0nMpebqLrW7Gf-9Ujx09yZDKHlT-ilt-0omGD2cevmsGEenRxGwOpicIa_Vo"; 
  const COOKIE_NAME = "sp_dc"; // Change this if you target a site other than Spotify

  // Update this list of selectors for the play button if targeting a different site:
  const TARGET_BUTTON_SELECTOR = 'button[data-testid="play-button"], button[data-testid="control-button-playpause"], button[aria-label^="Play"]';

  // =========================================================

  const url = req.query.url;
  const wait = req.query.wait ? parseInt(req.query.wait) : 5;

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: "Method not allowed, use GET." });
  }

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
        '--mute-audio'
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

    // --- 2. INJECT CUSTOM HARDCODED COOKIE ---
    let cookieInjected = false;
    if (SP_DC_COOKIE_VALUE !== "PASTE_YOUR_SP_DC_COOKIE_HERE" && SP_DC_COOKIE_VALUE !== "") {
      // Automatically grab the domain from the requested URL (e.g., .spotify.com)
      const urlObj = new URL(url);
      const baseDomain = `.${urlObj.hostname.replace(/^www\./, '')}`;

      await page.setCookie({
        name: COOKIE_NAME,
        value: SP_DC_COOKIE_VALUE,
        domain: baseDomain,
        path: '/',
        secure: true,
        httpOnly: true // Often required for session cookies
      });
      cookieInjected = true;
      console.log(`Injected custom cookie: ${COOKIE_NAME}`);
    }

    const networkLogs = [];
    const generateHash = (data) => crypto.createHash('sha256').update(data).digest('hex');

    // --- 3. DEEP NETWORK LISTENER FOR API DATA ---
    page.on('response', async (response) => {
      try {
        const request = response.request();
        const resourceType = request.resourceType();
        
        let payload = request.postData();
        
        if (payload) {
          try { payload = JSON.parse(payload); } catch (e) { /* Leave as string */ }
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

    // --- 4. OPEN PAGE ---
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // --- 5. WAIT EXACTLY 4 SECONDS AFTER OPENING ---
    await new Promise(resolve => setTimeout(resolve, 4000));

    // --- 6. FIND AND CLICK TARGET BUTTON ---
    let buttonClicked = false;
    
    try {
      await page.waitForSelector(TARGET_BUTTON_SELECTOR, { timeout: 3000 });
      
      const clicked = await page.evaluate((selector) => {
        const buttons = document.querySelectorAll(selector);
        for (let btn of buttons) {
          if (btn && btn.offsetParent !== null) { // Ensure button is visible
            btn.click();
            return true;
          }
        }
        // Fallback: click the first one if visibility checks fail
        if (buttons.length > 0) {
          buttons[0].click();
          return true;
        }
        return false;
      }, TARGET_BUTTON_SELECTOR);

      buttonClicked = clicked;
      
      // Wait after clicking to allow API streaming/tracking requests to fire
      await new Promise(resolve => setTimeout(resolve, 5000)); 

    } catch (e) {
      console.log("Target button not found or failed to click.");
    }

    const finalUrl = page.url();
    await browser.close();

    const apiCallsWithPostData = networkLogs.filter(log => log.is_api_call && log.requestPayload);

    return res.status(200).json({
      target_url: url,
      final_url: finalUrl,
      custom_cookie_used: cookieInjected ? COOKIE_NAME : "None",
      waited_before_click: "4 seconds",
      button_clicked: buttonClicked,
      total_requests: networkLogs.length,
      total_api_post_requests: apiCallsWithPostData.length,
      logs: networkLogs // Returns all network activity and payloads
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ 
      error: "Scraper failed or timeout", 
      details: error.message
    });
  }
}
