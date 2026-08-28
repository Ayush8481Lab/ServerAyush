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
    page.setDefaultTimeout(60000);

    // Inject script to intercept the decryption function
    await page.evaluateOnNewDocument(() => {
      // Wait for the page's `ue` function to be defined, then wrap it
      const originalUe = window.ue;
      if (originalUe) {
        window.ue = async function(x) {
          const result = await originalUe(x);
          window.__decryptedInfo = result; // Store the decrypted JSON string
          return result;
        };
      } else {
        // If not defined yet, set a mutation observer or use a setInterval to check
        const checkInterval = setInterval(() => {
          if (window.ue && !window.__uePatched) {
            window.__uePatched = true;
            const orig = window.ue;
            window.ue = async function(x) {
              const result = await orig(x);
              window.__decryptedInfo = result;
              return result;
            };
            clearInterval(checkInterval);
          }
        }, 100);
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait for the decrypted data to be stored
    const thumbnail = await page.waitForFunction(
      () => {
        if (window.__decryptedInfo) {
          try {
            const data = JSON.parse(window.__decryptedInfo);
            return data.thumbnail || data.poster || null;
          } catch (e) {
            return null;
          }
        }
        return null;
      },
      { timeout: 30000, polling: 500 }
    );

    if (!thumbnail) {
      throw new Error('Thumbnail not found in decrypted data');
    }

    const posterUrl = `https://hubstream.art${thumbnail}`;
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
