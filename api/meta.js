export default async function handler(req, res) {
  // 1. Allow GET requests & Set CORS
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { url, seo, genres, pref_lang, spn, epn } = req.query;
  const defaultLang = pref_lang || 'hindi';

  if (!url && !seo && !genres) {
    return res.status(400).json({ error: 'Require one parameter: url, seo, or genres' });
  }

  // 2. Updated Cookie JSON Data
  const cookieJson = [
    { "name": "_fbp", "value": "fb.1.1785327084836.754731018580690365" },
    { "name": "preferredLang", "value": "hindi" },
    { "name": "CloudFront-Signature", "value": "AOUzFv6c8wtdDOPzY2xnboyfOEa9TbJ2hH31yc~tct1qzEhmx7H-LJcs6Fz-ieiC-f0H8Z~BIDnwVpkLg5csN8dyjDZcmyjvTqWVNUc1BFA8l7RtPwxYL-J-AXJTt8g6afGi~A0Aze-EENvjQg~wkckdz2KmJJnu2WRiE7oOCtXFIJshPrm~Sr~HKj6NOZqehlA2VVvcEbAfz6YJvm3OpY2TeP7gFgo2Xgp~BF4VT77qrHfTo65YqsoPx0XbATXMW9IJh5qzVnMvfbxP0UkYeuyApAC91BPenOHOr1iiFFeybGCWcjdIXuRA-IaYPmQp0XelgxinLVWLZj1J805nIA__" },
    { "name": "_gcl_au", "value": "1.1.602972533.1785327083" },
    { "name": "_gcl_aw", "value": "GCL.1785327237.CjwKCAjwyabTBhBFEiwAM3mNUAef-up7eB0G9WCZiRCPVS_3UFdEbsTHywdx4StEmPceY_J38bCaKhoCBAoQAvD_BwE" },
    { "name": "jwtToken", "value": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzU1NzkzNDAsImV4cCI6MTc4NjcwMTc2MSwidW5pcXVlX2lkIjoiOGIwODRkYWQtNDEzOC00ZDdlLTk5YWItZTEzYTQyOTA1MDk2In0.LSt4D5LlBBd-mMlEeFpIPys0Y1rifumzqBHk5AiIR6R9_OqcSMYIZAyH0itp-cC0e5lmGGMBThYVUj4cVH5Fdg" },
    { "name": "_ga", "value": "GA1.1.2139426549.1785327084" },
    { "name": "_ga_S16VQXJEBE", "value": "GS2.1.s1785405697$o3$g1$t1785405763$j57$l0$h0" },
    { "name": "_gcl_gs", "value": "2.1.k1$i1785327080$u234687327" },
    { "name": "cdn_cookie_created_at", "value": "\"2026-07-30 09:59:47+00:00\"" },
    { "name": "cdn_cookie_expires_at", "value": "\"2026-07-30 11:59:47+00:00\"" },
    { "name": "CloudFront-Key-Pair-Id", "value": "K2ZMC0VBPI9ZOX" },
    { "name": "CloudFront-Policy", "value": "eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9tZWRpYS5jZG4ua3VrdWZtLmNvbS8qIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzg1NDEyNzg3fX0sIkN1c3RvbURhdGEiOnsidXNlcl9pZCI6Mzc1MTI5NTY4fX1dfQ__" },
    { "name": "guest_user_id", "value": "4415862b-2624-445f-b805-6ecc9fb31120" },
    { "name": "has_strip_banner", "value": "false" }
  ];

  // 3. Dynamic Header Generator (Changes based on the Show's Language)
  const getFetchOptions = (customReferer, showLang) => {
    const lang = showLang || defaultLang;

    const cookieString = cookieJson.map(cookie => {
      if (cookie.name === 'preferredLang') return `${cookie.name}=${lang}`;
      return `${cookie.name}=${cookie.value}`;
    }).join('; ');

    return {
      method: 'GET',
      headers: {
        'preferred-lang': lang,
        'referer': customReferer || 'https://kukutv.app/',
        'x-source-service': 'nodejs-web',
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'package-name': 'com.vlv.web.reels',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'cookie': cookieString
      },
      redirect: 'follow',
    };
  };

  // ==========================================
  // HELPER: Fetch all Episodes for a specific Slug
  // ==========================================
  async function fetchAllEpisodesForShow(slug, showLang) {
    const pageSize = 50;
    // URL Encode the slug so regional fonts/characters are safely transmitted
    const encodedSlug = encodeURIComponent(slug);
    
    const referer = `https://kukutv.app/show/${encodedSlug}`;
    const firstPageUrl = `https://kukutv.app/api/v2.3/channels/${encodedSlug}/episodes?page=1&page_size=${pageSize}`;
    
    try {
      const firstPageRes = await fetch(firstPageUrl, getFetchOptions(referer, showLang));
      
      if (!firstPageRes.ok) throw new Error(`Status ${firstPageRes.status}`);
      const firstPageData = await firstPageRes.json();

      let allEpisodes = firstPageData.episodes || [];
      const nPages = firstPageData.n_pages || 1;
      const nEpisodes = firstPageData.n_episodes || allEpisodes.length;

      if (nPages > 1) {
        const fetchPromises = [];
        for (let page = 2; page <= nPages; page++) {
          const pageUrl = `https://kukutv.app/api/v2.3/channels/${encodedSlug}/episodes?page=${page}&page_size=${pageSize}`;
          fetchPromises.push(
            fetch(pageUrl, getFetchOptions(referer, showLang))
              .then(res => res.json())
              .catch(() => ({}))
          );
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
      return { no_of_episodes: 0, episodes: [] };
    }
  }

  try {
    // ==========================================
    // FEATURE 3: SCRAPE ENTIRE GENRE FOR ALL LANGUAGES (?genres=...)
    // ==========================================
    if (genres) {
      const ALL_LANGUAGES = [
        "hindi", "tamil", "kannada", "telugu", "malayalam", 
        "marathi", "bengali", "english", "bhojpuri", "haryanvi", "punjabi"
      ];

      const encodedGenre = encodeURIComponent(genres);
      let genreTitle = genres;
      const uniqueShowsMap = new Map();

      // Setup custom start and end pages if provided (Default to 1 -> Infinity)
      const startPage = spn ? parseInt(spn, 10) : 1;
      const endPage = epn ? parseInt(epn, 10) : Infinity;

      // 1. Loop through EVERY language
      for (const targetLang of ALL_LANGUAGES) {
        let pageIndex = startPage;
        let keepFetching = true;

        // 2. Fetch genre pages 5 AT A TIME per language
        // Stop if keepFetching is false OR we exceed the user-defined endPage
        while (keepFetching && pageIndex <= endPage) {
          const batchPromises = [];
          
          // Determine how many pages to fetch in this batch (Max 5, but don't exceed endPage)
          const pagesToFetch = Math.min(5, endPage - pageIndex + 1);

          for (let i = 0; i < pagesToFetch; i++) {
            const currentPage = pageIndex + i;
            const apiUrl = `https://kukutv.app/api/v3/genres/${encodedGenre}/shows?page=${currentPage}&lang=english&preferred_langs=${targetLang}&preferred_lang=${targetLang}`;
            
            batchPromises.push(
              fetch(apiUrl, getFetchOptions(null, targetLang))
                .then(res => {
                  if (!res.ok) throw new Error(`Status ${res.status}`);
                  return res.json();
                })
                .catch(() => null) 
            );
          }

          const batchResults = await Promise.all(batchPromises);
          let foundHasNextFalse = false;
          let validPagesInBatch = 0;

          for (const resData of batchResults) {
            if (!resData) continue;
            validPagesInBatch++;
            
            if (resData.genre && resData.genre.title) {
              genreTitle = resData.genre.title;
            }

            if (resData.cu_shows && resData.cu_shows.length > 0) {
              resData.cu_shows.forEach(show => {
                if (!uniqueShowsMap.has(show.slug)) {
                  uniqueShowsMap.set(show.slug, show); 
                }
              });
            }

            if (resData.has_next === false) {
              foundHasNextFalse = true;
            }
          }

          if (foundHasNextFalse || validPagesInBatch === 0) {
            keepFetching = false;
          }
          
          pageIndex += 5;
        }
      }

      const rawShows = Array.from(uniqueShowsMap.values());

      // CALCULATE STATS
      const totalShowsCount = rawShows.length;
      const languageBreakdown = {};
      rawShows.forEach(show => {
        const lang = show.language || 'unknown';
        languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
      });

      // 3. Fetch episodes for ALL discovered shows (Batched in chunks of 20)
      const formattedShows = [];
      const chunkSize = 20; 
      
      for (let i = 0; i < rawShows.length; i += chunkSize) {
        const showChunk = rawShows.slice(i, i + chunkSize);
        
        const chunkResults = await Promise.all(showChunk.map(async (show) => {
          const episodeData = await fetchAllEpisodesForShow(show.slug, show.language);
          
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
        Total_shows: totalShowsCount,
        Languages: languageBreakdown,
        shows: formattedShows
      });
    }

    // ==========================================
    // FEATURE 1: SCRAPE SINGLE SHOW (?seo=...)
    // ==========================================
    if (seo) {
      const episodeData = await fetchAllEpisodesForShow(seo, defaultLang);
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
      const response = await fetch(targetUrl.toString(), getFetchOptions(null, defaultLang));

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
