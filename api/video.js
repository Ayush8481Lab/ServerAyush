import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const videoId = req.query.id || '6kssfa';
  const url = `https://hubstream.art/#${videoId}`;

  let browser = null;
  try {
    const executablePath = await chromium.executablePath(
      'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar'
    );

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    // 1. Intercept all requests
    let posterUrl = null;
    const requestHandler = (request) => {
      const url = request.url();
      // Look for the poster image pattern
      if (url.includes('poster.png') || url.includes('/poster')) {
        posterUrl = url;
        // Optionally abort to save bandwidth
        // request.abort();
      }
    };
    page.on('request', requestHandler);

    // 2. Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 3. Wait a bit for the poster request to be initiated
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. If not found via network, try DOM as fallback
    if (!posterUrl) {
      posterUrl = await page.evaluate(() => {
        const img = document.querySelector('img[src*="poster"], .vds-poster img, media-poster img');
        return img ? img.src : null;
      });
    }

    if (!posterUrl) {
      throw new Error('Poster URL not found');
    }

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
