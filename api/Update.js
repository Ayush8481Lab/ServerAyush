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

    page.on('request', (interceptedRequest) => {
      const url = interceptedRequest.url();

      if (url.includes('pathfinder') && url.includes('query')) {
        const method = interceptedRequest.method();

        // CASE A: Spotify sent it as a POST request
        if (method === 'POST') {
          const postData = interceptedRequest.postData();
          if (postData && postData.includes('getTrack')) {
            try {
              const parsed = JSON.parse(postData);
              if (parsed.operationName === 'getTrack') exactPayload = parsed;
            } catch (e) {}
          }
        } 
        // CASE B: Spotify sent it as a GET request (Standard for Tracks)
        else if (method === 'GET' && url.includes('operationName=getTrack')) {
          try {
            const urlObj = new URL(url);
            exactPayload = {
              operationName: urlObj.searchParams.get('operationName'),
              variables: JSON.parse(urlObj.searchParams.get('variables')),
              extensions: JSON.parse(urlObj.searchParams.get('extensions'))
            };
          } catch (e) {}
        }
      }
    });

    await page.goto('https://open.spotify.com/track/4qnFfsCaMe2Nsg1VfFPxq9', { 
      waitUntil: 'networkidle2' 
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
    await browser.close();

    if (exactPayload) {
      return res.status(200).json({
        SUCCESS: "COPY THE 'payload' OBJECT BELOW INTO YOUR PYTHON main.py",
        payload: exactPayload
      });
    } else {
      return res.status(404).json({ error: "Payload not intercepted. Spotify may have served this page via static SSR." });
    }

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to open page", details: error.message });
  }
}
