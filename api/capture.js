import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  const url = req.query.url;
  const wait = req.query.wait ? parseInt(req.query.wait) : 3;

  if (!url) {
    return res.status(400).json({ error: "Please provide a URL. Example: ?url=https://google.com&wait=3" });
  }

  let browser = null;
  try {
    // Keep the specific v143 pack for Vercel compatibility
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
    const networkLogs = [];

    // Listen to background network requests
    page.on('request', (request) => {
      const requestUrl = request.url();
      let requestHash = "";
      
      // Extract hash from the request URL if it exists
      try {
        const parsedUrl = new URL(requestUrl);
        requestHash = parsedUrl.hash;
      } catch (e) {
        requestHash = "";
      }

      networkLogs.push({
        url: requestUrl,
        method: request.method(),
        type: request.resourceType(),
        hash: requestHash // Added hash to individual logs
      });
    });

    // Open the website
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for the requested number of seconds
    await new Promise(resolve => setTimeout(resolve, wait * 1000));

    // Capture the final URL and its hash before closing
    const finalUrl = page.url();
    let finalHash = "";
    try {
      finalHash = new URL(finalUrl).hash;
    } catch (e) {
      finalHash = "";
    }

    // Close the browser to free up Vercel memory
    await browser.close();

    // Send the logs back with the added hash fields
    return res.status(200).json({
      target_url: url,
      final_url: finalUrl,      // Added final URL
      hash: finalHash,           // Added hash of the final URL
      waited_seconds: wait,
      total_requests: networkLogs.length,
      logs: networkLogs
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to open page", details: error.message });
  }
}
