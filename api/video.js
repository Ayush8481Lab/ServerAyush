// api/poste
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  // Allow only GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optionally accept a video ID from query, default to 6kssfa
  const videoId = req.query.id || '6kssfa';
  const url = `https://hubstream.art/#${videoId}`;

  let browser = null;
  try {
    // Launch browser with Chromium from the package
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    // Set a reasonable timeout
    page.setDefaultTimeout(30000);

    // Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for the poster image to appear
    // The poster is inside .vds-poster img, but sometimes it might be in a different element.
    // We'll wait for any img with src containing '/poster.png' or just the first poster img.
    const posterSelector = '.vds-poster img';
    await page.waitForSelector(posterSelector, { timeout: 15000 });

    // Extract the src attribute
    const posterUrl = await page.$eval(posterSelector, (el) => el.src);

    // If no src found, try alternative selectors
    if (!posterUrl) {
      // Sometimes poster is set as background-image style, but we'll stick with img.
      throw new Error('Poster image not found');
    }

    // Return the poster URL
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
