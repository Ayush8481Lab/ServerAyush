import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import crypto from 'crypto';

export default async function handler(req, res) {
  let body = {};
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (e) {}
    } else {
      body = req.body;
    }
  }

  let url = req.query.url || body.url;
  let hash = req.query.hash || body.hash || req.query.fragment || body.fragment;
  const wait = req.query.wait ? parseInt(req.query.wait) : (body.wait ? parseInt(body.wait) : 5);

  if (!url) {
    return res.status(400).json({ error: "Please provide a URL." });
  }

  if (hash) {
    let cleanHash = hash.trim();
    if (!cleanHash.startsWith('#')) {
      cleanHash = '#' + cleanHash;
    }
    if (!url.includes('#')) {
      url = url + cleanHash;
    }
  }

  let browser = null;
  let capturedEdata = null; // Container to store the API response

  try {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      args: [
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
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const networkLogs = [];
    const generateHash = (data) => crypto.createHash('sha256').update(data).digest('hex');

    // Deep Network Listener
    page.on('response', async (response) => {
      try {
        const request = response.request();
        const responseUrl = response.url();
        
        const logEntry = {
          url: responseUrl,
          method: request.method(),
          type: request.resourceType(),
          status: response.status(),
          requestHeaders: request.headers(), 
          responseHeaders: response.headers(), 
          sha256Hash: "n/a",
          capturedData: null
        };

        try { logEntry.hash = new URL(responseUrl).hash; } catch (e) { logEntry.hash = ""; }

        // 1. SPECIFICALLY CAPTURE THE DATA OF THE EDATA API
        if (responseUrl.includes('/PublicBhuApi/api/edata') && response.status() === 200) {
          const responseText = await response.text().catch(() => null);
          if (responseText) {
            try {
              capturedEdata = JSON.parse(responseText);
              logEntry.capturedData = capturedEdata;
            } catch (e) {
              logEntry.capturedData = responseText;
            }
          }
        }

        // 2. Capture Buffer Hash for other resources (excluding large media)
        if (response.status() < 300 || response.status() >= 400) {
          if (!['image', 'media', 'font'].includes(request.resourceType())) {
            const buffer = await response.buffer().catch(() => null);
            if (buffer) {
              logEntry.sha256Hash = generateHash(buffer);
            }
          }
        }
        networkLogs.push(logEntry);
      } catch (err) {
        // Ignore failures on closed or incomplete streams
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Allow time for the SPA to render and execute its API calls
    await new Promise(resolve => setTimeout(resolve, wait * 1000));

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
      captured_edata: capturedEdata, // The captured API payload is returned here
      total_requests: networkLogs.length,
      logs: networkLogs
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ 
      error: "Bypass failed or timeout", 
      details: error.message,
    });
  }
}
