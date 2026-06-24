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
    
    // We replace the single variable with an Array to trap everything
    const capturedHistory = [];

    page.on('request', (interceptedRequest) => {
      const url = interceptedRequest.url();

      if (url.includes('pathfinder') && url.includes('query')) {
        const method = interceptedRequest.method();

        // 1. CATCH POST REQUESTS
        if (method === 'POST') {
          const postData = interceptedRequest.postData();
          if (postData) {
            try {
              const parsed = JSON.parse(postData);
              // GraphQL allows sending an array of multiple payloads at once
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
        // 2. CATCH GET REQUESTS
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

    await page.goto('https://open.spotify.com/track/4qnFfsCaMe2Nsg1VfFPxq9', { 
      waitUntil: 'networkidle2' 
    });

    // PRO TRICK: Scroll down 1500 pixels to force Spotify to trigger 
    // the "Lyrics", "Credits", and "Artist Bio" GraphQL calls!
    await page.evaluate(() => window.scrollBy(0, 3000));

    // Wait 4 seconds for the scroll-triggered network requests to finish
    await new Promise(resolve => setTimeout(resolve, 6000));

    await browser.close();

    return res.status(200).json({
      total_api_calls_captured: capturedHistory.length,
      menu_of_operations: capturedHistory.map(x => x.operationName),
      all_data: capturedHistory
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Scraping failed", details: error.message });
  }
}
