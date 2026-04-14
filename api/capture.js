import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';
import crypto from 'crypto'; // Required for SHA256

export default async function handler(req, res) {
  const url = req.query.url;
  const wait = req.query.wait ? parseInt(req.query.wait) : 3;

  if (!url) {
    return res.status(400).json({ error: "Please provide a URL. Example: ?url=https://google.com&wait=3" });
  }

  let browser = null;
  try {
    // Keep your specific v143 pack for Vercel libnss3.so compatibility
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

    // Function to generate SHA256 hex hash
    const generateHash = (data) => {
      return crypto.createHash('sha256').update(data).digest('hex');
    };

    // Listen to background network RESPONSES to get the body for hashing
    page.on('response', async (response) => {
      const request = response.request();
      const logEntry = {
        url: response.url(),
        method: request.method(),
        type: request.resourceType(),
        status: response.status(),
        hash: "",             // URL fragment (#)
        sha256Hash: "n/a"     // Content hash
      };

      // 1. Get URL Fragment (the '#' part)
      try {
        logEntry.hash = new URL(response.url()).hash;
      } catch (e) {
        logEntry.hash = "";
      }

      // 2. Get Content SHA256 Hash
      try {
        // Only try to hash if there is likely a body (exclude redirects/empty)
        if (response.status() < 300 || response.status() >= 400) {
          const buffer = await response.buffer();
          if (buffer && buffer.length > 0) {
            logEntry.sha256Hash = generateHash(buffer);
          }
        }
      } catch (e) {
        // Response body might be unavailable for some requests (e.g. 304, aborted)
        logEntry.sha256Hash = "unavailable";
      }

      networkLogs.push(logEntry);
    });

    // Open the website
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for the requested number of seconds
    await new Promise(resolve => setTimeout(resolve, wait * 1000));

    // Capture the final page content and its hash
    const finalUrl = page.url();
    const htmlContent = await page.content();
    const pageSha256 = generateHash(htmlContent);

    let finalUrlFragment = "";
    try {
      finalUrlFragment = new URL(finalUrl).hash;
    } catch (e) {
      finalUrlFragment = "";
    }

    // Close the browser to free up Vercel memory
    await browser.close();

    // Send the detailed logs back
    return res.status(200).json({
      target_url: url,
      final_url: finalUrl,
      url_fragment: finalUrlFragment, // The # part of the URL
      page_sha256Hash: pageSha256,     // SHA256 of the actual HTML source
      waited_seconds: wait,
      total_requests: networkLogs.length,
      logs: networkLogs
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to open page", details: error.message });
  }
}
