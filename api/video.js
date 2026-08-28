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
    // 1. Download Chromium binary
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
    page.setDefaultTimeout(60000); // Increase timeout

    // 2. Intercept the response from /api/v1/info
    const responsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/v1/info') && response.status() === 200,
      { timeout: 30000 }
    );

    // 3. Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 4. Wait for the API response
    const response = await responsePromise;
    const encryptedHex = await response.text();

    // 5. Use the page's own decryption function `ue` to decrypt the response
    const thumbnail = await page.evaluate(async (hex) => {
      // The page's `ue` function should be globally available
      // If not, we need to find it in the global scope.
      // We'll attempt to call it from the window.
      const decryptedJson = await window.ue(hex);
      const data = JSON.parse(decryptedJson);
      return data.thumbnail || data.poster || null;
    }, encryptedHex);

    if (!thumbnail) {
      throw new Error('No thumbnail/poster found in decrypted data');
    }

    // 6. Construct full URL
    const baseUrl = 'https://hubstream.art';
    const posterUrl = thumbnail.startsWith('http') ? thumbnail : `${baseUrl}${thumbnail}`;

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
