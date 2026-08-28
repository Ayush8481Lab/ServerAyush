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

    // ------------------------------
    // 1. Instrument Web Crypto API
    // ------------------------------
    await page.evaluateOnNewDocument(() => {
      // Store captured values
      window.__captured = { key: null, iv: null };

      const originalImportKey = window.crypto.subtle.importKey.bind(window.crypto.subtle);
      const originalDecrypt = window.crypto.subtle.decrypt.bind(window.crypto.subtle);

      // Override importKey to capture the raw key material
      window.crypto.subtle.importKey = async function(format, keyData, algorithm, extractable, usages) {
        // If it's an AES-CBC key, capture it
        if (algorithm.name === 'AES-CBC') {
          // keyData is an ArrayBuffer or TypedArray – convert to Base64
          const raw = new Uint8Array(keyData);
          window.__captured.key = btoa(String.fromCharCode(...raw));
        }
        return originalImportKey(format, keyData, algorithm, extractable, usages);
      };

      // Override decrypt to capture the IV
      window.crypto.subtle.decrypt = async function(algorithm, key, data) {
        if (algorithm.name === 'AES-CBC' && algorithm.iv) {
          const ivArray = new Uint8Array(algorithm.iv);
          window.__captured.iv = btoa(String.fromCharCode(...ivArray));
        }
        return originalDecrypt(algorithm, key, data);
      };
    });

    // ------------------------------
    // 2. Intercept poster request
    // ------------------------------
    let posterUrl = null;
    page.on('request', (request) => {
      if (request.url().includes('poster.png')) {
        posterUrl = request.url();
      }
    });

    // ------------------------------
    // 3. Navigate to the page
    // ------------------------------
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Wait a moment for the decryption to happen
    await new Promise(resolve => setTimeout(resolve, 5000));

    // ------------------------------
    // 4. Retrieve captured key & IV
    // ------------------------------
    const captured = await page.evaluate(() => {
      return window.__captured;
    });

    if (!captured.key || !captured.iv) {
      throw new Error('Key or IV not captured – decryption may not have run or used different algorithm');
    }

    res.status(200).json({
      poster: posterUrl,
      keyBase64: captured.key,
      ivBase64: captured.iv,
      note: 'These values are session-specific and expire. Use them only for understanding the decryption process.'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
