const crypto = require('crypto');

// Decryption helper
function decryptUrl(encryptedText) {
  if (!encryptedText) return null;
  try {
    const key = Buffer.from("abcdefghijklmnop", 'utf8');
    const iv = Buffer.from("abcdefghijklmnop", 'utf8');
    
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
    return null;
  }
}

// Standard CommonJS export
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { id, date } = req.query;

  if (!id || !date) {
    return res.status(400).json({ error: 'Missing parameters. Please provide both "id" and "date".' });
  }

  try {
    const targetUrl = `https://epaper.livehindustan.com/Home/GetAllpages?editionid=${id}&editiondate=${date}`;
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      return res.status(response.status).json({ error: `Target server responded with status: ${response.status}` });
    }

    const data = await response.json();

    const decryptedPages = data.map(page => {
      return {
        ...page,
        HrImageUrl: decryptUrl(page.HrImageUrl),
        HrImageUrlJpg: decryptUrl(page.HrImageUrlJpg)
      };
    });

    res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600');
    return res.status(200).json(decryptedPages);

  } catch (error) {
    return res.status(500).json({ error: 'Failed to process request', details: error.message });
  }
};
