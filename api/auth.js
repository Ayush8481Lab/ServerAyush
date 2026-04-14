import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  // 1. Force Vercel to NEVER cache this API response
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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
      // Add extra chromium args to disable caching at the browser level
      args: [...chromium.args, '--incognito', '--disable-application-cache'],
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    // 2. Open an completely fresh Incognito Window
    const context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();

    // 3. Disable Puppeteer cache and Bypass Service Workers
    await page.setCacheEnabled(false);
    await page.setBypassServiceWorker(true);
    
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

    // Open the website
    await page.goto(url, { waitUntil: 'domcontentloaded' });

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
        details: `Waited ${wait} seconds but Spotify didn't generate the token in time. Try passing ?wait=2 or ?wait=3.` 
      });
    }

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to open page", details: error.message });
  }
}
