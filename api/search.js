export default async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.status(200).end();

    let { q, artist } = req.query;
    if (!q) return res.status(400).json({ error: "Missing query parameter 'q'" });

    // Helper: Unescape HTML entities from API outputs
    const cleanHTML = (str) => str ? str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&rsquo;/g, "'") : "";
    
    // EXACT cleaning logic: lowercase, remove special characters, trim spaces
    const clean = (s) => cleanHTML(s || "").toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim();

    try {
        // ==========================================
        // 2 CONCURRENT QUERIES AS REQUESTED
        // ==========================================
        
        // Query 1: Exactly like "?query=Dhurandhar...&artist=Shashwat..."
        const targetApi1 = `https://ayushm-psi.vercel.app/api/search/songs?query=${encodeURIComponent(q)}${artist ? `&artist=${encodeURIComponent(artist)}` : ""}`;
        
        // Query 2: Exactly like "?query=Dhurandhar... Shashwat..."
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

        // Fetch both APIs at exactly the same time for maximum speed
        const [results1, results2] = await Promise.all([
            fetchResults(targetApi1),
            fetchResults(targetApi2)
        ]);

        // Combine both responses
        const combinedResults =[...results1, ...results2];

        if (combinedResults.length === 0) {
            return res.status(404).json({ error: "No matching song found in either query." });
        }

        // Deduplicate songs by ID so we don't process the same song twice
        const uniqueResultsMap = new Map();
        combinedResults.forEach(song => {
            if (song && song.id && !uniqueResultsMap.has(song.id)) {
                uniqueResultsMap.set(song.id, song);
            }
        });
        
        const results = Array.from(uniqueResultsMap.values());
        
        // ==========================================
        // DEEP ANALYSIS & MATCHING LOGIC 
        // ==========================================
        const tTitle = clean(q); 
        
        // Split provided artists by comma so we can match them individually (Deep Analysis)
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
            let artistMatched = false;
            
            // Artist matching - DEEP ANALYSIS
            if (tArtistsArray.length > 0) {
                // Check each individual artist from your query against each artist in the result
                for (let ta of tArtistsArray) {
                    for (let ra of rArtists) { 
                        if (ra === ta) { 
                            score += 100; 
                            artistMatched = true; 
                            break; 
                        } else if (ra.includes(ta) || ta.includes(ra)) { 
                            score += 80; 
                            artistMatched = true; 
                            break; 
                        } 
                    }
                    // If we found at least one artist match, break early and keep the score
                    if (artistMatched) break;
                }
                if (!artistMatched) score = 0; // Penalize if no artist matched at all
            } else { 
                score += 50; // Base score if no artist was provided in query
            }
            
            // Title matching - DEEP ANALYSIS
            if (score > 0) { 
                if (rTitle === tTitle) {
                    score += 100; 
                } else if (rTitle.startsWith(tTitle) || tTitle.startsWith(rTitle)) {
                    score += 80; 
                } else if (rTitle.includes(tTitle) || tTitle.includes(rTitle)) {
                    score += 50; 
                }
            }
            
            // Set Best Match
            if (score > highestScore) { 
                highestScore = score; 
                bestMatch = song; 
            }
        });

        // If score is 0, no valid match was found
        if (highestScore === 0 || !bestMatch) {
            return res.status(404).json({ error: "No exact match found." });
        }

        // ==========================================
        // RESPONSE FORMATTING
        // ==========================================
        const song = bestMatch;
        const primaryArtists = song.artists?.primary ||[];
        const featuredArtists = song.artists?.featured || [];
        const allArtists = [...primaryArtists, ...featuredArtists]
            .map(a => cleanHTML(a.name))
            .join(", ");

        const bestBanner = (song.image && song.image.length > 0) 
            ? song.image[song.image.length - 1].url 
            : "";

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
