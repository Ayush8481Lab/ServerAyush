import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  // Prevent caching at all layers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const url = req.query.url || 'https://open.spotify.com';
  
  // Capture the real IP of the user making the API request
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  let browser = null;
  try {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      args:[...chromium.args, '--incognito'],
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    
    await page.setCacheEnabled(false);
    await page.setBypassServiceWorker(true);

    // 1. Turn on request interception
    await page.setRequestInterception(true);
    let capturedUrl = null;

    page.on('request', (request) => {
      const reqUrl = request.url();
      
      // 2. Catch the totp token URL but STOP Vercel's browser from claiming it!
      if (reqUrl.includes('/api/token') && request.method() !== 'OPTIONS') {
        capturedUrl = reqUrl;
        request.abort(); 
      } 
      // Block images/styles to speed up the scraping
      else if (['image', 'stylesheet', 'font', 'media'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    const targetUrl = url.includes('?') ? `${url}&_cb=${Date.now()}` : `${url}?_cb=${Date.now()}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // 3. Wait until we capture the URL (Wait up to 3 seconds)
    let waitTime = 0;
    while (!capturedUrl && waitTime < 3000) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitTime += 100;
    }

    await browser.close();
    browser = null;

    if (capturedUrl) {
      
      // OPTION A: 100% Client-Side Fetch
      // If you call your API like this: https://my.vercel.app/api/auth?redirect=true
      // Vercel instantly redirects your device directly to the Spotify URL.
      if (req.query.redirect === 'true') {
        return res.redirect(307, capturedUrl);
      }

      // OPTION B: Vercel Proxy with IP Spoofing (Default)
      // Vercel fetches the token, but passes your actual Client IP to Spotify
      const spotifyRes = await fetch(capturedUrl, {
        headers: {
          'X-Forwarded-For': clientIp,
          'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0'
        }
      });
      
      const tokenData = await spotifyRes.json();
      
      // Attach your requested notes, plus the URL in case your app wants to fetch it manually
      tokenData._notes = "Developed By Ayush@8481";
      tokenData.client_url = capturedUrl; 
      
      return res.status(200).json(tokenData);

    } else {
      return res.status(404).json({ error: "Could not capture the dynamic totp URL from Spotify." });
    }

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to process", details: error.message });
  }
}
