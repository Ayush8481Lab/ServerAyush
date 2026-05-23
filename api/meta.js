const crypto = require('crypto');

// Decryption helper using native Node.js crypto module
function decryptUrl(encryptedText) {
  if (!encryptedText) return null;
  try {
    const key = Buffer.from("abcdefghijklmnop", 'utf8');
    const iv = Buffer.from("abcdefghijklmnop", 'utf8');
    
    // Auto-adjust Base64 padding if it was truncated by the API
    let base64 = encryptedText;
    const missingPadding = base64.length % 4;
    if (missingPadding) {
      base64 += '='.repeat(4 - missingPadding);
    }
    
    const encryptedBytes = Buffer.from(base64, 'base64');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    
    let decrypted = decipher.update(encryptedBytes);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (err) {
    // If decryption fails, return null or the original error message
    return null;
  }
}

export default async function handler(req, res) {
  // Allow only GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id, date } = req.query;

  if (!id || !date) {
    return res.status(400).json({ error: 'Missing parameters. Please provide "id" (edition ID) and "date" (dd/mm/yyyy).' });
  }

  try {
    // 1. Fetch raw list data from Live Hindustan
    const targetUrl = `https://epaper.livehindustan.com/Home/GetAllpages?editionid=${id}&editiondate=${date}`;
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      return res.status(response.status).json({ error: `Target server responded with status: ${response.status}` });
    }

    const data = await response.json();

    // 2. Map through pages and replace encrypted fields with direct links
    const decryptedPages = data.map(page => {
      return {
        ...page,
        HrImageUrl: decryptUrl(page.HrImageUrl),
        HrImageUrlJpg: decryptUrl(page.HrImageUrlJpg)
      };
    });

    // 3. Optional: Set edge cache headers to make subsequent requests load instantly
    res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600');

    return res.status(200).json(decryptedPages);

  } catch (error) {
    return res.status(500).json({ error: 'Failed to process request', details: error.message });
  }
}
