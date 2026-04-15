export default async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.status(200).end();

    let { q, artist } = req.query;
    if (!q) return res.status(400).json({ error: "Missing query parameter 'q'" });

    // Helper: Unescape HTML entities from API outputs
    const cleanHTML = (str) => {
        return str ? str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&rsquo;/g, "'") : "";
    };
    
    // EXACT cleaning logic: lowercase, remove special characters, trim spaces
    const clean = (s) => cleanHTML(s || "").toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim();

    try {
        // ==========================================
        // 1. PERFORM 2 CONCURRENT QUERIES
        // ==========================================
        
        // Query 1: Format -> ?query=SongName&artist=ArtistName
        const targetApi1 = `https://ayushm-psi.vercel.app/api/search/songs?query=${encodeURIComponent(q)}${artist ? `&artist=${encodeURIComponent(artist)}` : ""}`;
        
        // Query 2: Format -> ?query=SongName ArtistName
        const searchQueryCombined = `${q} ${artist || ""}`.trim();
        const targetApi2 = `https://ayushm-psi.vercel.app/api/search/songs?query=${encodeURIComponent(searchQueryCombined)}`;
        
        // Helper to fetch and safely return results array
        const fetchResults = async (url) => {
            try {
                const response = await fetch(url);
                const data = await response.json();
                return (data.success && data.data?.results) ? data.data.results :[];
            } catch (err) {
                return[];
            }
        };

        // Fetch both APIs at exactly the same time
        const [results1, results2] = await Promise.all([
            fetchResults(targetApi1),
            fetchResults(targetApi2)
        ]);

        // ==========================================
        // 2. MIX BOTH RESPONSES AND DEDUPLICATE
        // ==========================================
        const combinedResults =[...results1, ...results2];

        if (combinedResults.length === 0) {
            return res.status(404).json({ error: "No matching song found in either query." });
        }

        const uniqueResultsMap = new Map();
        combinedResults.forEach(song => {
            if (song && song.id && !uniqueResultsMap.has(song.id)) {
                uniqueResultsMap.set(song.id, song);
            }
        });
        
        // This 'results' array contains the fully mixed & deduplicated list
        const results = Array.from(uniqueResultsMap.values());
        
        // ==========================================
        // 3. DEEP ANALYSIS MATCHING ON MIXED RESULTS
        // ==========================================
        const tTitle = clean(q); 
        
        // Split provided artists by comma for deep individual matching
        const tArtistsArray = artist ? artist.split(',').map(a => clean(a)).filter(a => a) :[];
        
        let bestMatch = null; 
        let highestScore = 0;
        
        results.forEach(song => {
            if (!song) return;
            
            const rTitle = clean(song.name); 
            
            // Extract artists safely from JioSaavn structure
            const primaryArtists = song.artists?.primary ||[];
            const featuredArtists = song.artists?.featured || [];
            const rArtists = [...primaryArtists, ...featuredArtists].map(a => clean(a.name));
            
            let score = 0; 
            
            // --- Artist Matching (DEEP ANALYSIS) ---
            if (tArtistsArray.length > 0) {
                let matchedAtLeastOneArtist = false;
                
                // We check EVERY artist in your query. The more matches, the higher the score.
                for (let ta of tArtistsArray) {
                    for (let ra of rArtists) { 
                        if (ra === ta) { 
                            score += 100; // Perfect match for this specific artist
                            matchedAtLeastOneArtist = true; 
                            break; 
                        } else if (ra.includes(ta) || ta.includes(ra)) { 
                            score += 80;  // Partial match for this specific artist
                            matchedAtLeastOneArtist = true; 
                            break; 
                        } 
                    }
                }
                
                // If ZERO artists matched out of the long list, penalize heavily.
                if (!matchedAtLeastOneArtist) {
                    score = 0;
                }
            } else { 
                score += 50; // Base score if no artist was provided in query
            }
            
            // --- Title Matching ---
            // Only evaluate title if the artist matched (or if no artist was provided)
            if (score > 0) { 
                if (rTitle === tTitle) {
                    score += 100; 
                } else if (rTitle.startsWith(tTitle) || tTitle.startsWith(rTitle)) {
                    score += 80; 
                } else if (rTitle.includes(tTitle) || tTitle.includes(rTitle)) {
                    score += 50; 
                }
            }
            
            // --- Set Best Match ---
            if (score > highestScore) { 
                highestScore = score; 
                bestMatch = song; 
            }
        });

        if (highestScore === 0 || !bestMatch) {
            return res.status(404).json({ error: "No exact match found." });
        }

        // ==========================================
        // 4. RESPONSE FORMATTING
        // ==========================================
        const song = bestMatch;
        const primaryArtists = song.artists?.primary || [];
        const featuredArtists = song.artists?.featured ||[];
        const allArtists = [...primaryArtists, ...featuredArtists]
            .map(a => cleanHTML(a.name))
            .join(", ");

        const bestBanner = (song.image && song.image.length > 0) 
            ? song.image[song.image.length - 1].url 
            : "";

        // Properly structure the response without cutting off
        const filteredResponse = {
            Title: cleanHTML(song.name),
            Artists: allArtists || "Unknown Artist",
            Bannerlink: bestBanner,
            PermaUrl: song.url,
            StreamLinks: song.downloadUrl ||[]
        };

        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        return res.status(200).json(filteredResponse);

    } catch (error) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
