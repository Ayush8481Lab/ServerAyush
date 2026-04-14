import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import crypto from 'crypto';

export default async function handler(req, res) {
  const url = req.query.url;
  const wait = req.query.wait ? parseInt(req.query.wait) : 5; // Increased default wait for challenges

  if (!url) {
    return res.status(400).json({ error: "Please provide a URL." });
  }

  let browser = null;
  try {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-blink-features=AutomationControlled', // Hides "Automation" status
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ],
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    
    // 1. SET REAL USER AGENT (Crucial to bypass go-away)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');

    // 2. STEALTH: Remove the webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const networkLogs = [];
    const generateHash = (data) => crypto.createHash('sha256').update(data).digest('hex');

    // Deep Network Listener
    page.on('response', async (response) => {
      try {
        const request = response.request();
        const logEntry = {
          url: response.url(),
          method: request.method(),
          type: request.resourceType(),
          status: response.status(),
          headers: response.headers(), // Deep analysis: Headers
          sha256Hash: "n/a"
        };

        // Extract URL Fragment
        try { logEntry.hash = new URL(response.url()).hash; } catch (e) { logEntry.hash = ""; }

        // Capture Buffer for Hash (only for non-redirects)
        if (response.status() < 300 || response.status() >= 400) {
          const buffer = await response.buffer().catch(() => null);
          if (buffer) {
            logEntry.sha256Hash = generateHash(buffer);
          }
        }
        networkLogs.push(logEntry);
      } catch (err) {
        // Silently skip if response is closed or failed
      }
    });

    // 3. BYPASS CHALLENGE: Navigate and wait for potential redirects
    // Use 'networkidle2' to ensure the "go-away" challenge JS has finished executing
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Extra wait for the "meta-refresh" challenge to actually redirect
    await new Promise(resolve => setTimeout(resolve, wait * 1000));

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
      logs: networkLogs
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
