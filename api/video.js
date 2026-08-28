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

    // Navigate and wait for network to be mostly idle
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for the player to appear
    await page.waitForSelector('media-player', { timeout: 10000 });

    // Poll for the poster URL (image or background)
    const posterUrl = await page.waitForFunction(
      () => {
        // 1. Try to find an <img> with a valid src
        const images = document.querySelectorAll('img');
        for (const img of images) {
          const src = img.src;
          if (src && src.length > 0 && !src.startsWith('data:') && (src.includes('poster') || src.includes('thumbnail'))) {
            return src;
          }
        }

        // 2. Check specific poster containers
        const posterSelectors = ['.vds-poster', 'media-poster', '[data-poster]'];
        for (const sel of posterSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            // Check <img> inside
            const img = el.querySelector('img');
            if (img && img.src && !img.src.startsWith('data:')) {
              return img.src;
            }
            // Check background-image
            const bg = getComputedStyle(el).backgroundImage;
            if (bg && bg !== 'none') {
              const match = bg.match(/url\(["']?(.*?)["']?\)/);
              if (match) return match[1];
            }
          }
        }

        // 3. Look for any image with src starting with / and containing 'poster' or 'thumbnail'
        const allImgs = document.querySelectorAll('img[src*="poster"], img[src*="thumbnail"]');
        for (const img of allImgs) {
          if (img.src && !img.src.startsWith('data:')) {
            return img.src;
          }
        }

        return null;
      },
      { timeout: 15000, polling: 500 }
    );

    if (!posterUrl) {
      throw new Error('Poster image not found after waiting');
    }

    // Return the absolute URL (already absolute because browser resolves it)
    res.status(200).json({ poster: posterUrl });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
