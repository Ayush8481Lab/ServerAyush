export default async function handler(req, res) {
  // 1. Only allow GET requests and Set CORS Headers
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { url, seo } = req.query;

  if (!url && !seo) {
    return res.status(400).json({ error: 'Either "url" or "seo" parameter is required' });
  }

  // 2. Your cookies in JSON format (Easy to update later)
  const cookieJson = [
    { "name": "_fbp", "value": "fb.1.1785327084836.754731018580690365" },
    { "name": "preferredLang", "value": "hindi" },
    { "name": "CloudFront-Signature", "value": "VwCKTcwD2F9-bNQdclGbjCXnemYGkQ7ZlxMvU7m-MjgqCh5vQwd9LfQgPx6zJPxDu4i~RZdthp4jO3coIsvym~lMYqmqatbpTkZ9SIkw1LoVYpEl7mt3nbP52Bm2hhwucLMUNj2~bbEZuNvU4xmQvKjvhPdz-R1EmMwWX3fV4PO6AFGPiQFBPYjy1lBQIfCplFpyukHuwWQbnVDEcdPn9qSsPtioQkwlAV3j1ipUASvn654CeUF8qrUVh9D3sk9iI8rsX3KqZpu8BCkWldHaqNuyhXsLSswmbS8yw2MaIh2ntM9issNM3eptXzjtQbEBuBj5q5x9YofsxIBMQZs5~Q__" },
    { "name": "_gcl_au", "value": "1.1.602972533.1785327083" },
    { "name": "_gcl_aw", "value": "GCL.1785327237.CjwKCAjwyabTBhBFEiwAM3mNUAef-up7eB0G9WCZiRCPVS_3UFdEbsTHywdx4StEmPceY_J38bCaKhoCBAoQAvD_BwE" },
    { "name": "jwtToken", "value": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzUxMjk1NjgsImV4cCI6MTc4NjYyMzU3NywidW5pcXVlX2lkIjoiMWRmOTgwM2ItMzkxZC00YjBkLThlNzctOTMxOGNjYmRjODMxIn0.Vm6ClBDkfkAhUWWXnxFhKufGWgG_dNOobvHbiQUYqxu7HzZ-OOm7k30WVenedkZKmQ8YwEcg3wgpSEEUrjmnlA" },
    { "name": "_ga", "value": "GA1.1.2139426549.1785327084" },
    { "name": "_ga_S16VQXJEBE", "value": "GS2.1.s1785327083$o1$g1$t1785327583$j57$l0$h0" },
    { "name": "_gcl_gs", "value": "2.1.k1$i1785327080$u234687327" },
    { "name": "cdn_cookie_created_at", "value": "\"2026-07-29 12:13:37+00:00\"" },
    { "name": "cdn_cookie_expires_at", "value": "\"2026-07-29 14:13:37+00:00\"" },
    { "name": "CloudFront-Key-Pair-Id", "value": "K2ZMC0VBPI9ZOX" },
    { "name": "CloudFront-Policy", "value": "eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9tZWRpYS5jZG4ua3VrdWZtLmNvbS8qIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzg1MzM0NDE3fX0sIkN1c3RvbURhdGEiOnsidXNlcl9pZCI6Mzc1MTI5NTY4fX1dfQ__" },
    { "name": "guest_user_id", "value": "fbd1272b-5ecb-48d6-a2b6-d640fdd5664e" },
    { "name": "has_strip_banner", "value": "false" }
  ];

  // Convert JSON to string format
  const cookieString = cookieJson.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

  // Standardized Fetch Options
  const getFetchOptions = (customReferer) => ({
    method: 'GET',
    headers: {
      'preferred-lang': 'hindi',
      'referer': customReferer || 'https://kukutv.app/watch/gaonwala-super-husband?episode=episode-10-4103',
      'x-source-service': 'nodejs-web',
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'package-name': 'com.vlv.web.reels',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'cookie': cookieString
    },
    redirect: 'follow',
  });

  try {
    // ==========================================
    // FEATURE 1: SCRAPE ALL EPISODES (?seo=...)
    // ==========================================
    if (seo) {
      const pageSize = 50;
      const firstPageUrl = `https://kukutv.app/api/v2.3/channels/${seo}/episodes?page=1&page_size=${pageSize}`;
      const referer = `https://kukutv.app/show/${seo}`;

      // Fetch the first page to get metadata and first batch of episodes
      const firstPageRes = await fetch(firstPageUrl, getFetchOptions(referer));
      const firstPageData = await firstPageRes.json();

      let allEpisodes = firstPageData.episodes || [];
      const nPages = firstPageData.n_pages || 1;
      const nEpisodes = firstPageData.n_episodes || allEpisodes.length;

      // If there is more than 1 page, fetch them all concurrently
      if (nPages > 1) {
        const fetchPromises = [];
        
        for (let page = 2; page <= nPages; page++) {
          const pageUrl = `https://kukutv.app/api/v2.3/channels/${seo}/episodes?page=${page}&page_size=${pageSize}`;
          fetchPromises.push(
            fetch(pageUrl, getFetchOptions(referer)).then(res => res.json())
          );
        }

        // Wait for all remaining pages to resolve at the same time
        const remainingPagesData = await Promise.all(fetchPromises);
        
        // Merge the episodes from all extra pages into our main array
        for (const pageData of remainingPagesData) {
          if (pageData.episodes) {
            allEpisodes = allEpisodes.concat(pageData.episodes);
          }
        }
      }

      // Format the exact response requested by you
      const formattedResponse = {
        slug: seo,
        no_of_episodes: nEpisodes,
        episodes: allEpisodes.map(ep => ({
          title: ep.title, // e.g., "Episode - 1"
          video_hls_url: ep.content?.video_hls_url || ep.content?.hls_url || null, // Gets the .m3u8 link
          duration: ep.duration_s || ep.content?.duration || 0 // Gets duration in seconds
        }))
      };

      return res.status(200).json(formattedResponse);
    }

    // ==========================================
    // FEATURE 2: RAW PROXY (?url=...)
    // ==========================================
    if (url) {
      const targetUrl = new URL(url);
      const response = await fetch(targetUrl.toString(), getFetchOptions());

      const contentType = response.headers.get('content-type') || '';
      let data;
      
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return res.status(response.status).send(data);
    }

  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch the requested resource', details: error.message });
  }
}
