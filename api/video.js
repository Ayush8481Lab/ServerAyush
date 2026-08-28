// Using Puppeteer
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('https://hubstream.art/#6kssfa', { waitUntil: 'networkidle2' });

  // Wait for the player to load, then extract the poster from the DOM
  const posterUrl = await page.evaluate(() => {
    // The poster image is usually inside .vds-poster img
    const img = document.querySelector('.vds-poster img');
    return img ? img.src : null;
  });

  console.log('Poster URL:', posterUrl);
  await browser.close();
})();
