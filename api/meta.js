export default async function handler(req, res) {
  // 1. Allow GET requests & Set CORS
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { url, seo, genres } = req.query;

  if (!url && !seo && !genres) {
    return res.status(400).json({ error: 'Require one parameter: url, seo, or genres' });
  }

  // 2. Cookie JSON Data
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

  const cookieString = cookieJson.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

  // 3. Dynamic Header Generator
  const getFetchOptions = (customReferer) => ({
    method: 'GET',
    headers: {
      'preferred-lang': 'hindi',
      'referer': customReferer || 'https://kukutv.app/',
      'x-source-service': 'nodejs-web',
      'accept': 'application/json, text/plain, */*',
      'content-type': 'application/json',
      'package-name': 'com.vlv.web.reels',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'cookie': cookieString
    },
    redirect: 'follow',
  });

  // ==========================================
  // HELPER: Fetch all Episodes for a specific Slug
  // ==========================================
  async function fetchAllEpisodesForShow(slug) {
    const pageSize = 50;
    const referer = `https://kukutv.app/show/${slug}`;
    const firstPageUrl = `https://kukutv.app/api/v2.3/channels/${slug}/episodes?page=1&page_size=${pageSize}`;
    
    try {
      const firstPageRes = await fetch(firstPageUrl, getFetchOptions(referer));
      const firstPageData = await firstPageRes.json();

      let allEpisodes = firstPageData.episodes || [];
      const nPages = firstPageData.n_pages || 1;
      const nEpisodes = firstPageData.n_episodes || allEpisodes.length;

      // Fetch remaining pages simultaneously if they exist
      if (nPages > 1) {
        const fetchPromises = [];
        for (let page = 2; page <= nPages; page++) {
          const pageUrl = `https://kukutv.app/api/v2.3/channels/${slug}/episodes?page=${page}&page_size=${pageSize}`;
          fetchPromises.push(fetch(pageUrl, getFetchOptions(referer)).then(res => res.json()));
        }
        const remainingPagesData = await Promise.all(fetchPromises);
        
        for (const pageData of remainingPagesData) {
          if (pageData.episodes) {
            allEpisodes = allEpisodes.concat(pageData.episodes);
          }
        }
      }

      return {
        no_of_episodes: nEpisodes,
        episodes: allEpisodes.map(ep => ({
          title: ep.title,
          video_hls_url: ep.content?.video_hls_url || ep.content?.hls_url || null,
          duration: ep.duration_s || ep.content?.duration || 0
        }))
      };
    } catch (e) {
      console.error(`Error fetching episodes for ${slug}:`, e.message);
      return { no_of_episodes: 0, episodes: [] }; // Fallback on error
    }
  }

  try {
    // ==========================================
    // FEATURE 3: NEW - SCRAPE ENTIRE GENRE (?genres=...)
    // ==========================================
    if (genres) {
      let pageIndex = 1;
      let keepFetching = true;
      let genreTitle = genres;
      let rawShows = [];

      // 1. Fetch genre pages 20 pages at a time until has_next is false
      while (keepFetching) {
        const batchPromises = [];
        for (let i = 0; i < 20; i++) {
          const currentPage = pageIndex + i;
          const url = `https://kukutv.app/api/v3/genres/${genres}/shows?page=${currentPage}&lang=english&preferred_langs=hindi&preferred_lang=hindi`;
          batchPromises.push(
            fetch(url, getFetchOptions()).then(res => res.json()).catch(() => null) // Ignore failed single pages
          );
        }

        const batchResults = await Promise.all(batchPromises);

        for (const resData of batchResults) {
          if (!resData) continue;
          
          if (resData.genre && resData.genre.title) {
            genreTitle = resData.genre.title; // Extract exact genre title dynamically
          }

          if (resData.cu_shows && resData.cu_shows.length > 0) {
            rawShows.push(...resData.cu_shows);
          }

          // If we encounter a page indicating the end, stop fetching more pages
          if (resData.has_next === false || !resData.cu_shows || resData.cu_shows.length === 0) {
            keepFetching = false;
          }
        }
        pageIndex += 20;
      }

      // 2. Fetch episodes for EVERY discovered show (Batched in chunks of 20 to prevent server timeout/crashing)
      const formattedShows = [];
      const chunkSize = 20; 
      
      for (let i = 0; i < rawShows.length; i += chunkSize) {
        const showChunk = rawShows.slice(i, i + chunkSize);
        
        const chunkResults = await Promise.all(showChunk.map(async (show) => {
          const episodeData = await fetchAllEpisodesForShow(show.slug);
          return {
            slug: show.slug,
            title: show.title,
            image: show.image || (show.other_images && show.other_images.title_image) || "",
            language: show.language,
            no_of_episodes: episodeData.no_of_episodes || show.n_episodes,
            episodes: episodeData.episodes
          };
        }));
        
        formattedShows.push(...chunkResults);
      }

      return res.status(200).json({
        Genre: genreTitle,
        shows: formattedShows
      });
    }

    // ==========================================
    // FEATURE 1: SCRAPE SINGLE SHOW (?seo=...)
    // ==========================================
    if (seo) {
      const episodeData = await fetchAllEpisodesForShow(seo);
      const formattedResponse = {
        slug: seo,
        no_of_episodes: episodeData.no_of_episodes,
        episodes: episodeData.episodes
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
    return res.status(500).json({ error: 'Failed to process request', details: error.message });
  }
}
