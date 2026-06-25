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
    const capturedHistory = [];

    // OMNI-CATCHER INTERCEPTOR
    page.on('request', (interceptedRequest) => {
      const url = interceptedRequest.url();

      if (url.includes('pathfinder') && url.includes('query')) {
        const method = interceptedRequest.method();

        if (method === 'POST') {
          const postData = interceptedRequest.postData();
          if (postData) {
            try {
              const parsed = JSON.parse(postData);
              const batch = Array.isArray(parsed) ? parsed : [parsed];
              batch.forEach(item => {
                capturedHistory.push({
                  operationName: item.operationName || "Unnamed_POST",
                  method: "POST",
                  payload: item
                });
              });
            } catch (e) {}
          }
        } 
        else if (method === 'GET') {
          try {
            const urlObj = new URL(url);
            const opName = urlObj.searchParams.get('operationName') || "Unnamed_GET";
            capturedHistory.push({
              operationName: opName,
              method: "GET",
              payload: {
                operationName: opName,
                variables: JSON.parse(urlObj.searchParams.get('variables') || '{}'),
                extensions: JSON.parse(urlObj.searchParams.get('extensions') || '{}')
              }
            });
          } catch (e) {}
        }
      }
    });

    const trackId = '4qnFfsCaMe2Nsg1VfFPxq9';

    // =========================================================
    // STEP 1: VISIT THE TRACK PAGE 
    // =========================================================
    await page.goto(`https://open.spotify.com/track/${trackId}`, { 
      waitUntil: 'networkidle2' 
    });
    
    // =========================================================
    // STEP 2: CLICK THE "MORE" (3-DOTS) BUTTON
    // We target the data-testid attribute because it is hardcoded by Spotify
    // =========================================================
    try {
      const moreBtn = await page.waitForSelector('button[data-testid="more-button"]', { timeout: 5000 });
      await moreBtn.click();
      
      // Wait 1.5 seconds for the React dropdown menu to animate open
      await new Promise(resolve => setTimeout(resolve, 1500)); 
    } catch (e) {
      console.log("Could not find the 3-dots button.");
    }

    // =========================================================
    // STEP 3: FIND "GO TO SONG RADIO" AND CLICK IT
    // =========================================================
    await page.evaluate(() => {
      // Find every link/button in the context menu
      const menuItems = Array.from(document.querySelectorAll('a, button, [role="menuitem"]'));
      
      // Look for the exact text (ignoring case)
      const radioBtn = menuItems.find(el => el.textContent.toLowerCase().includes('song radio'));
      
      if (radioBtn) {
        radioBtn.click(); // Trigger the exact action a human would!
      }
    });

    // =========================================================
    // STEP 4: CAPTURE THE RADIO PLAYLIST PAYLOADS
    // Wait 5 seconds for the SPA router to transition to /playlist/37i9dQZF1...
    // and fire the network requests
    // =========================================================
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Scroll down the radio page to ensure the full playlist loads
    await page.evaluate(() => window.scrollBy(0, 2000));
    await new Promise(resolve => setTimeout(resolve, 3000));

    await browser.close();

    const uniqueOperations = [...new Set(capturedHistory.map(x => x.operationName))];

    return res.status(200).json({
      total_api_calls_captured: capturedHistory.length,
      menu_of_unique_operations: uniqueOperations,
      all_data: capturedHistory
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Scraping failed", details: error.message });
  }
}
