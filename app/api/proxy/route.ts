export const runtime = 'edge'; // Must use edge to bypass 4.5MB payload limits

export async function GET(req: Request) {
  const urlObj = new URL(req.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing target URL', { status: 400 });
  }

  try {
    // 1. Fetch the requested URL (m3u8, serve.key, or .ts)
    const response = await fetch(targetUrl, {
      headers: {
        // Spoof headers to bypass basic Akamai/CDN blocks
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://dishmt.xyz.com/', // Often required by stream providers
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      return new Response(`Error fetching upstream: ${response.status}`, { status: response.status });
    }

    // 2. Intercept and Rewrite the .m3u8 Playlists
    if (targetUrl.includes('.m3u8')) {
      let manifest = await response.text();
      const baseUrl = targetUrl; // Used to resolve relative paths

      // Rewrite the Decryption Key (serve.key) URL to go through Vercel
      manifest = manifest.replace(/URI="([^"]+)"/g, (match, keyUri) => {
        // Convert to absolute URL using the base URL, then point to our Vercel proxy
        const absoluteKeyUrl = new URL(keyUri, baseUrl).href;
        return `URI="/api/proxy?url=${encodeURIComponent(absoluteKeyUrl)}"`;
      });

      // Rewrite .ts segment URLs and sub-playlist URLs to go through Vercel
      manifest = manifest.split('\n').map(line => {
        line = line.trim();
        // If the line is not empty and is not an HLS tag (starts with #)
        if (line && !line.startsWith('#')) {
          const absoluteMediaUrl = new URL(line, baseUrl).href;
          return `/api/proxy?url=${encodeURIComponent(absoluteMediaUrl)}`;
        }
        return line;
      }).join('\n');

      return new Response(manifest, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*', // Critical for CORS
          'Cache-Control': 'no-cache'
        }
      });
    }

    // 3. Pass through the serve.key and .ts files directly
    // Because we are in Edge runtime, response.body is streamed chunk-by-chunk automatically!
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*', // Critical so the player can download the key/ts
        'Cache-Control': 'public, max-age=3600'
      }
    });

  } catch (error: any) {
    return new Response(`Proxy Error: ${error.message}`, { status: 500 });
  }
}
