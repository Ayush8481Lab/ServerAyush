import express from 'express';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium-min';

const app = express();
const PORT = process.env.PORT || 3000;

// Target Domains
const DOMAINS =[
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yt.chocolatemoo53.com"
];

// Helper to extract formatted Audio & Video from Invidious JSON
const parseMedia = (invidiousData, returnOnlyAudio) => {
    const audioList = [];
    const videoList =[];

    // Parse Adaptive Formats (Separated Audio & Video)
    if (invidiousData.adaptiveFormats) {
        for (const stream of invidiousData.adaptiveFormats) {
            if (stream.type.startsWith('audio/')) {
                audioList.push({
                    Quality: stream.audioQuality || `${Math.round(stream.bitrate / 1000)} kbps`,
                    Link: stream.url
                });
            } else if (!returnOnlyAudio && stream.type.startsWith('video/')) {
                videoList.push({
                    Quality: stream.qualityLabel || stream.resolution,
                    Link: stream.url
                });
            }
        }
    }

    // Parse Format Streams (Muxed Video + Audio)
    if (!returnOnlyAudio && invidiousData.formatStreams) {
        for (const stream of invidiousData.formatStreams) {
            videoList.push({
                Quality: `${stream.qualityLabel || stream.resolution} (Muxed)`,
                Link: stream.url
            });
        }
    }

    if (returnOnlyAudio) {
        return { Audio: audioList };
    }

    return {
        Audio: audioList,
        Video: videoList
    };
};

// Endpoint: /api/server?id=VIDEO_ID&type=audio (optional)
app.get('/api/server', async (req, res) => {
    const { id, type } = req.query;

    if (!id) {
        return res.status(400).json({ error: "Please provide a video id (?id=...)" });
    }

    const isAudioOnly = type && type.toLowerCase() === 'audio';
    let browser = null;

    try {
        const executablePath = await chromium.executablePath(
            "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar"
        );

        browser = await puppeteer.launch({
            args:[
                ...chromium.args,
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ],
            executablePath: executablePath,
            headless: chromium.headless,
            defaultViewport: chromium.defaultViewport,
        });

        // Map domains to an array of Promises. They will run SIMULTANEOUSLY.
        // Promise.any() resolves the moment the FIRST instance successfully bypasses the challenge.
        const scrapePromises = DOMAINS.map(async (domain) => {
            const page = await browser.newPage();
            
            // Bypass techniques
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
            await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

            // Direct API call inside the browser instance to get the raw JSON
            const apiUrl = `${domain}/api/v1/videos/${id}`;
            await page.goto(apiUrl, { waitUntil: 'domcontentloaded' });

            // Wait until the body text is actually valid JSON and contains formatstreams (Bypasses go-away refresh challenges)
            await page.waitForFunction(() => {
                try {
                    const data = JSON.parse(document.body.innerText);
                    // Ensure the JSON has media objects (it passed the challenge)
                    return data && (data.formatStreams || data.adaptiveFormats);
                } catch (e) {
                    return false;
                }
            }, { timeout: 45000 }); // Wait up to 45s for the challenge loops to finish

            // Extract the pure JSON
            const jsonStr = await page.evaluate(() => document.body.innerText);
            await page.close(); // Close tab cleanly
            return JSON.parse(jsonStr);
        });

        // Fetch the fastest successful result
        const fastestValidData = await Promise.any(scrapePromises);
        
        // Close the browser to free memory
        await browser.close();

        // Parse and return the requested format
        const finalResponse = parseMedia(fastestValidData, isAudioOnly);
        return res.status(200).json(finalResponse);

    } catch (error) {
        if (browser) await browser.close();
        return res.status(500).json({
            error: "Failed to retrieve media. All instances may be rate-limited or the ID is invalid.",
            details: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
