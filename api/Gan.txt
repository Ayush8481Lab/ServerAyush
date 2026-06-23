import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import crypto from 'crypto';

export default async function handler(req, res) {
  const url = req.query.url;
  const wait = req.query.wait ? parseInt(req.query.wait) : 5;

  if (!url) {
    return res.status(400).json({ error: "Please provide a URL." });
  }

  let browser = null;
  try {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      args:[
        ...chromium.args,
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    
    // 1. SET REAL USER AGENT
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

    // 2. STEALTH
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const networkLogs =[];
    const generateHash = (data) => crypto.createHash('sha256').update(data).digest('hex');

    // Deep Network Listener - UPDATED TO CAPTURE API BODIES
    page.on('response', async (response) => {
      try {
        const request = response.request();
        const resourceType = request.resourceType();
        const status = response.status();
        
        const logEntry = {
          url: response.url(),
          method: request.method(),
          type: resourceType,
          status: status,
          headers: response.headers(),
          sha256Hash: "n/a"
        };

        try { logEntry.hash = new URL(response.url()).hash; } catch (e) { logEntry.hash = ""; }

        // Only process responses that are successful
        if (status >= 200 && status < 300) {
          
          // FEATURE 1: Capture the actual JSON body of APIs (Search APIs, Autocomplete, etc.)
          if (['xhr', 'fetch'].includes(resourceType)) {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('application/json')) {
              try {
                const jsonBody = await response.json();
                logEntry.responseBody = jsonBody; // <--- The API data will be here!
              } catch (e) {
                // Ignore parse errors if response is empty or malformed
              }
            }
          }

          // Generate Hash (Optimized to skip large media files to prevent Vercel crashes)
          if (!['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
             try {
                const buffer = await response.buffer();
                if (buffer) logEntry.sha256Hash = generateHash(buffer);
             } catch (e) { /* Buffer failed */ }
          }
        }
        
        networkLogs.push(logEntry);
      } catch (err) {
        // Silently skip if response is closed or failed
      }
    });

    // 3. BYPASS CHALLENGE & LOAD PAGE
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, wait * 1000));

    // FEATURE 2: Extract embedded SSR Data (Crucial for Gaana initial search loads)
    const ssrData = await page.evaluate(() => {
      // Look for Next.js hydration script (used by Gaana and many others)
      const nextDataEl = document.getElementById('__NEXT_DATA__');
      if (nextDataEl) {
        try { return JSON.parse(nextDataEl.textContent); } catch (e) {}
      }
      return null;
    });

    // Final Capture
    const finalUrl = page.url();
    const htmlContent = await page.content();
    const pageSha256 = generateHash(htmlContent);

    let finalUrlFragment = "";
    try { finalUrlFragment = new URL(finalUrl).hash; } catch (e) { finalUrlFragment = ""; }

    await browser.close();

    return res.status(200).json({
      target_url: url,
      final_url: finalUrl,
      url_fragment: finalUrlFragment,
      page_sha256Hash: pageSha256,
      waited_seconds: wait,
      total_requests: networkLogs.length,
      embedded_ssr_data: ssrData, // <--- You will find Gaana's SSR search results here
      logs: networkLogs // <--- You will find the API responseBody here
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ 
      error: "Bypass failed or timeout", 
      details: error.message,
      note: "Try increasing the 'wait' parameter or checking if the site has IP-blocked Vercel."
    });
  }
}
