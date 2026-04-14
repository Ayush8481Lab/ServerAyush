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
    let exactPayload = null;

    // 1. Secretly listen to all network requests
    page.on('request', (interceptedRequest) => {
      // Look specifically for Spotify's GraphQL API
      if (interceptedRequest.url().includes('pathfinder/v2/query')) {
        const postData = interceptedRequest.postData();
        
        // If the request contains the search data, steal the payload!
        if (postData && postData.includes('searchDesktop')) {
          exactPayload = JSON.parse(postData);
        }
      }
    });

    // 2. Open Spotify to a specific search page (This forces Spotify to fire the request)
    await page.goto('https://open.spotify.com/search/Drake', { waitUntil: 'networkidle2' });

    // Wait 3 seconds to ensure the API request finishes
    await new Promise(resolve => setTimeout(resolve, 3000));

    await browser.close();

    // 3. Print the exact Python dictionary you need for your main.py!
    if (exactPayload) {
      return res.status(200).json({
        SUCCESS: "COPY THE 'payload' OBJECT BELOW AND PASTE IT INTO YOUR PYTHON main.py",
        payload: exactPayload
      });
    } else {
      return res.status(404).json({ error: "Could not find the Payload. Try refreshing the page." });
    }

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to open page", details: error.message });
  }
}
