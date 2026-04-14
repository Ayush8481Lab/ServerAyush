import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  // 1. Force Vercel API network to NEVER cache this response at any layer
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const url = req.query.url || 'https://open.spotify.com';
  const wait = req.query.wait ? parseFloat(req.query.wait) : 0.5;

  let browser = null;
  try {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      // 2. Launch directly into Incognito mode
      args: [...chromium.args, '--incognito'],
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    // Use the first available page from the incognito browser
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    // 3. Disable cache and bypass service workers natively
    await page.setCacheEnabled(false);
    await page.setBypassServiceWorker(true);

    // 4. Send CDP Commands to wipe any lingering Vercel network cache
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCache');
    await client.send('Network.clearBrowserCookies');

    // 5. NUCLEAR OPTION: Delete the Service Worker API so Spotify cannot use offline cache
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined });
    });

    // 6. SPEED OPTIMIZATION: Abort images, fonts, and CSS to make Chromium lightning fast
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    let tokenData = null;

    // Listen to background network responses to catch the JSON payload
    page.on('response', async (response) => {
      const resUrl = response.url();
      
      // Check if it's the Spotify token endpoint and NOT an OPTIONS preflight request
      if (resUrl.includes('/api/token') && response.request().method() !== 'OPTIONS') {
        try {
          const json = await response.json();
          // Verify it's the correct payload by checking for clientId
          if (json && json.clientId) {
            tokenData = json;
          }
        } catch (err) {
          // Ignore errors if the body is empty or fails to parse
        }
      }
    });

    // 7. Append a random timestamp to the Spotify URL so it never loads from memory
    const targetUrl = url.includes('?') ? `${url}&_cb=${Date.now()}` : `${url}?_cb=${Date.now()}`;

    // Open the website
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // Wait for the requested number of seconds
    await new Promise(resolve => setTimeout(resolve, wait * 1000));

    // Close the browser to free up Vercel memory
    await browser.close();
    browser = null;

    // Send the customized JSON back to you
    if (tokenData) {
      tokenData._notes = "Developed By Ayush@8481";
      return res.status(200).json(tokenData);
    } else {
      return res.status(404).json({ 
        error: "Token request not found.", 
        details: `Waited ${wait} seconds but Spotify didn't generate the token. Vercel might be running slow. Try passing ?wait=2` 
      });
    }

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to open page", details: error.message });
  }
}
