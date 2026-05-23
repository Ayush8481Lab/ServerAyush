 import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

export default async function handler(req, res) {
  let browser = null;
  try {
    const executablePath = await chromium.executablePath(
      "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
    );

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: executablePath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });

    const page = await browser.newPage();
    let capturedCredentials = null;

    // 1. Expose a Node.js function to the browser context to send credentials back
    await page.exposeFunction('onCredentialsCaptured', (key, iv, source) => {
      if (!capturedCredentials) {
        capturedCredentials = { key, iv, source };
      }
    });

    // 2. Inject hooks to intercept CryptoJS and Web Crypto API before any script loads
    await page.evaluateOnNewDocument(() => {
      // --- Method A: Monkey-patch window.CryptoJS ---
      let originalCryptoJS;
      Object.defineProperty(window, 'CryptoJS', {
        get() {
          return originalCryptoJS;
        },
        set(val) {
          originalCryptoJS = val;
          if (val && val.AES && !val.AES.__patched) {
            val.AES.__patched = true;
            
            // Hook the decrypt function
            const originalDecrypt = val.AES.decrypt;
            val.AES.decrypt = function (ciphertext, key, cfg) {
              try {
                let keyStr = key;
                if (key && typeof key.toString === 'function') {
                  // Try to convert WordArray to readable Utf8 or Hex
                  try { keyStr = key.toString(originalCryptoJS.enc.Utf8) || key.toString(); } catch (e) { keyStr = key.toString(); }
                }

                let ivStr = '';
                if (cfg && cfg.iv && typeof cfg.iv.toString === 'function') {
                  try { ivStr = cfg.iv.toString(originalCryptoJS.enc.Utf8) || cfg.iv.toString(); } catch (e) { ivStr = cfg.iv.toString(); }
                }

                // Callback to Node process
                window.onCredentialsCaptured(keyStr, ivStr, 'CryptoJS.AES.decrypt');
              } catch (err) {
                console.error('Error extracting CryptoJS keys:', err);
              }
              return originalDecrypt.apply(this, arguments);
            };
          }
        },
        configurable: true
      });

      // --- Method B: Monkey-patch standard Web Crypto API (SubtleCrypto) ---
      if (window.crypto && window.crypto.subtle) {
        const originalDecrypt = window.crypto.subtle.decrypt;
        window.crypto.subtle.decrypt = async function (algorithm, key, data) {
          try {
            const algoName = algorithm.name || '';
            const ivHex = algorithm.iv 
              ? Array.from(new Uint8Array(algorithm.iv)).map(b => b.toString(16).padStart(2, '0')).join('')
              : 'None';
              
            window.onCredentialsCaptured(`WebCrypto Key (Object)`, `IV (Hex): ${ivHex}`, `SubtleCrypto [${algoName}]`);
          } catch (err) {}
          return originalDecrypt.apply(this, arguments);
        };
      }
    });

    // 3. Navigate to Live Hindustan ePaper
    await page.goto('https://epaper.livehindustan.com/', { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });

    // Wait a brief period (up to 8 seconds) to ensure the client-side JS runs and loads the paper
    let attempts = 0;
    while (!capturedCredentials && attempts < 8) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    await browser.close();

    // 4. Return results
    if (capturedCredentials) {
      return res.status(200).json({
        SUCCESS: "CREDENTIALS INTERCEPTED SUCCESSFULLY",
        source: capturedCredentials.source,
        SECRET_KEY: capturedCredentials.key,
        SECRET_IV: capturedCredentials.iv
      });
    } else {
      return res.status(404).json({ 
        error: "Failed to capture Key and IV automatically. Please make sure the ePaper loaded its assets correctly." 
      });
    }

  } catch (error) {
    if (browser) await browser.close();
    return res.status(500).json({ error: "Failed to execute scraper", details: error.message });
  }
}
