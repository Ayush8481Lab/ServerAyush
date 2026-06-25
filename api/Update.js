import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  let browser = null;
  try {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    
    // We are hunting for the exact moment this Playlist ID arrives on the machine
    const TARGET_ID = "37i9dQZF1E8NM0krosgZdk";
    const caughtEndpoints = [];

    // INTERCEPT EVERY SINGLE RESPONSE
    page.on('response', async (response) => {
      const url = response.url();
      
      // Ignore images, video streams, and CSS to speed up the scraper
      if (url.includes('.jpg') || url.includes('.png') || url.includes('.css') || url.includes('.js')) return;

      try {
        const text = await response.text();
        // IF THE RESPONSE CONTAINS THE RADIO ID, TRAP IT!
        if (text.includes(TARGET_ID)) {
          caughtEndpoints.push({
            url: url,
            method: response.request().method(),
            response_snippet: text.substring(0, 300) + "..." // Print the first 300 chars so you can analyze it
          });
        }
      } catch (e) {
        // Silently ignore responses that can't be parsed
      }
    });

    const trackId = '4qnFfsCaMe2Nsg1VfFPxq9';

    // 1. Visit the Track Page 
    await page.goto(`https://open.spotify.com/track/${trackId}`, { waitUntil: 'networkidle2' });
    
    // 2. Click the Radio Button
    try {
      const moreBtn = await page.waitForSelector('button[data-testid="more-button"]', { timeout: 5000 });
      await moreBtn.click();
      await new Promise(resolve => setTimeout(resolve, 1500)); 
    } catch (e) {}

    await page.evaluate(() => {
      const menuItems = Array.from(document.querySelectorAll('a, button, [role="menuitem"]'));
      const radioBtn = menuItems.find(el => el.textContent.toLowerCase().includes('song radio'));
      if (radioBtn) radioBtn.click();
    });

    // Wait 5 seconds for the network calls to finish
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();

    return res.status(200).json({
      SUCCESS: `We hunted down the exact origin of the Radio ID!`,
      endpoints_that_returned_it: caughtEndpoints
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Scraping failed", details: error.message });
  }
}
