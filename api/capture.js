import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import crypto from 'crypto';

export default async function handler(req, res) {
  // =========================================================
  // 1. CONFIGURATION: PASTE YOUR COOKIE & SELECTORS HERE
  // =========================================================
  
  const SP_DC_COOKIE_VALUE = "AQD05MKcMMPTA8l694-m7vEqCJh1IQ6qTFf7F93KsWhBFPHGYUw4DAxzdn9cLxnFcQjQl3GlI6mXtKwAq-drF4V--kcmVILwCKn1FX5mNtC23OtS3PaMobhGjYuHpQF9F-6Fty91MFjRVr6F0IW83eOQgPx-pC5XdYE4oZn55uaIZLClm01UhvzqA3dGw0IrFilH6zeCZ77FTtJgp-X0nMpebqLrW7Gf-9Ujx09yZDKHlT-ilt-0omGD2cevmsGEenRxGwOpicIa_Vo"; 
  const COOKIE_NAME = "sp_dc"; 

  // Spotify Play Button Selectors
  const TARGET_BUTTON_SELECTOR = 'button[data-testid="play-button"], button[data-testid="control-button-playpause"], button[aria-label^="Play"]';
  const PAUSE_BUTTON_SELECTOR = 'button[data-testid="control-button-playpause"][aria-label^="Pause"], button[aria-label^="Pause"]';

  // =========================================================

  const url = req.query.url;
  const wait = req.query.wait ? parseInt(req.query.wait) : 5;

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
        '--mute-audio', // Mute so Vercel doesn't hang on audio out
        '--autoplay-policy=no-user-gesture-required', // CRITICAL: Allows media to play without human interaction
        '--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies'
      ],
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    
    // Set realistic User-Agent and Viewport to ensure desktop layout loads
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // --- 2. INJECT CUSTOM HARDCODED COOKIE ---
    let cookieInjected = false;
    if (SP_DC_COOKIE_VALUE !== "PASTE_YOUR_SP_DC_COOKIE_HERE" && SP_DC_COOKIE_VALUE !== "") {
      const urlObj = new URL(url);
      const baseDomain = `.${urlObj.hostname.replace(/^www\./, '')}`;

      await page.setCookie({
        name: COOKIE_NAME,
        value: SP_DC_COOKIE_VALUE,
        domain: baseDomain,
        path: '/',
        secure: true,
        httpOnly: true
      });
      cookieInjected = true;
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
          if (buffer) { logEntry.sha256Hash = generateHash(buffer); }
        }
        networkLogs.push(logEntry);
      } catch (err) { }
    });

    // --- 4. OPEN PAGE ---
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // --- 5. NUKE OVERLAYS (Cookie banners, login popups that block clicks) ---
    // This injects CSS to permanently delete popups so our mouse click hits the actual button
    await page.addStyleTag({
      content: `
        #onetrust-consent-sdk, .onetrust-pc-dark-filter, 
        [data-testid="cookie-banner"], [id^="sp_message_container"],
        [data-testid="login-modal"], .GenericModal { 
          display: none !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; 
        }
      `
    });

    // --- 6. WAIT EXACTLY 4 SECONDS AFTER OPENING ---
    await new Promise(resolve => setTimeout(resolve, 4000));

    // --- 7. THE PERFECT CLICK (TRUSTED HARDWARE CLICK) ---
    let buttonClicked = false;
    let actuallyPlaying = false;
    let clickMethodUsed = "None";
    
    try {
      // Find the element handle natively
      const playButtonHandle = await page.waitForSelector(TARGET_BUTTON_SELECTOR, { timeout: 5000, visible: true });
      
      if (playButtonHandle) {
        // Scroll the button exactly into the middle of the screen
        await playButtonHandle.evaluate(b => b.scrollIntoView({ block: 'center' }));
        await new Promise(resolve => setTimeout(resolve, 500)); // wait for scroll animation

        // Get the exact X and Y coordinates of the center of the button on the screen
        const box = await playButtonHandle.boundingBox();
        
        if (box) {
          const x = box.x + (box.width / 2);
          const y = box.y + (box.height / 2);
          
          // Move the virtual mouse to the exact pixels and natively click (React recognizes this as a real human)
          await page.mouse.move(x, y);
          await page.mouse.down();
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms human-like click delay
          await page.mouse.up();
          
          clickMethodUsed = "Hardware Mouse Click (Trusted)";
          buttonClicked = true;
        } else {
          // Fallback if bounding box fails
          await playButtonHandle.click();
          clickMethodUsed = "Puppeteer Native Click";
          buttonClicked = true;
        }

        // Wait 3 seconds to let Spotify's API process the play command and start buffering
        await new Promise(resolve => setTimeout(resolve, 3000)); 

        // Verify if it actually played by checking if a "Pause" button has appeared
        const pauseButton = await page.$(PAUSE_BUTTON_SELECTOR);
        if (pauseButton) {
          actuallyPlaying = true;
        }
      }
    } catch (e) {
      console.log("Target button not found or failed to click:", e.message);
    }

    const finalUrl = page.url();
    await browser.close();

    const apiCallsWithPostData = networkLogs.filter(log => log.is_api_call && log.requestPayload);

    return res.status(200).json({
      target_url: url,
      final_url: finalUrl,
      custom_cookie_used: cookieInjected ? COOKIE_NAME : "None",
      waited_before_click: "4 seconds",
      click_attempt_successful: buttonClicked,
      click_method_used: clickMethodUsed,
      verified_playing: actuallyPlaying, // Will return true if the Pause button appeared!
      total_requests: networkLogs.length,
      total_api_post_requests: apiCallsWithPostData.length,
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
