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
    // We tell Vercel to download the missing browser files on the fly
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar"
    );

    browser = await puppeteer.launch({
      args:[...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    const networkLogs =[];

    // Listen to background network requests
    page.on('request', (req) => {
      networkLogs.push({
        url: req.url(),
        method: req.method(),
        type: req.resourceType()
      });
    });

    // Open the website
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for the requested number of seconds
    await new Promise(resolve => setTimeout(resolve, wait * 1000));

    // Close the browser to free up Vercel memory
    await browser.close();

    // Send the logs back to you
    return res.status(200).json({
      target_url: url,
      waited_seconds: wait,
      total_requests: networkLogs.length,
      logs: networkLogs
    });

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to open page", details: error.message });
  }
}
