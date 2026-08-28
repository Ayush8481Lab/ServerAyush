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
      executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    // Intercept poster request
    let posterUrl = null;
    page.on('request', (request) => {
      if (request.url().includes('poster.png')) {
        posterUrl = request.url();
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait a moment for the poster request
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Extract key and IV
    const cryptoKeys = await page.evaluate(() => {
      const key = window.ee();
      const iv = window.oe();
      return window.crypto.subtle.exportKey('raw', key).then((rawKey) => ({
        keyBase64: btoa(String.fromCharCode(...new Uint8Array(rawKey))),
        ivBase64: btoa(String.fromCharCode(...new Uint8Array(iv)))
      }));
    });

    res.status(200).json({
      poster: posterUrl,
      keyBase64: cryptoKeys.keyBase64,
      ivBase64: cryptoKeys.ivBase64,
      note: 'These keys are session-specific and may expire.'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) await browser.close();
  }
}
