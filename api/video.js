// api/poster.js
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const videoId = req.query.id || '6kssfa';
  const url = `https://hubstream.art/#${videoId}`;

  let browser = null;
  try {
    // Launch browser with the correct executable path
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for the poster image
    const posterSelector = '.vds-poster img';
    await page.waitForSelector(posterSelector, { timeout: 15000 });

    const posterUrl = await page.$eval(posterSelector, (el) => el.src);

    if (!posterUrl) {
      throw new Error('Poster image not found');
    }

    res.status(200).json({ poster: posterUrl });
  } catch (error) {
    console.error('Error fetching poster:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
