import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const videoId = req.query.id || '6kssfa';
  const url = `https://hubstream.art/#${videoId}`;

  let browser = null;
  try {
    // 1. Download Chromium binary using the same pattern as your working Spotify code
    const executablePath = await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar'
    );

    // 2. Launch browser
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    // 3. Navigate to the video page
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 4. Wait for the poster image to load
    const posterSelector = '.vds-poster img';
    await page.waitForSelector(posterSelector, { timeout: 15000 });

    // 5. Extract the src attribute
    const posterUrl = await page.$eval(posterSelector, (el) => el.src);

    if (!posterUrl) {
      throw new Error('Poster image not found');
    }

    // 6. Return the result
    res.status(200).json({ poster: posterUrl });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
