// Levenshtein distance similarity (returns a value from 0.0 to 1.0)
const getLevenshteinSimilarity = (s1, s2) => {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    const len1 = s1.length, len2 = s2.length;
    const matrix = Array.from({ length: len1 + 1 }, () => new Array(len2 + 1).fill(0));
    
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    const maxLen = Math.max(len1, len2);
    return (maxLen - matrix[len1][len2]) / maxLen;
};

export default async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.status(200).end();

    let { q, artist } = req.query;
    if (!q) return res.status(400).json({ error: "Missing query parameter 'q'" });

    // BUG FIX: Replace double quotes with &quot; so the target API understands the query properly
    const formatForApi = (str) => {
        return str ? str.replace(/"/g, '&quot;').trim() : "";
    };

    const safeQ = formatForApi(q);
    const safeArtist = formatForApi(artist);

    // Helper: Unescape HTML entities from API outputs
    const cleanHTML = (str) => {
        return str ? str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&rsquo;/g, "'") : "";
    };
    
    // EXACT cleaning logic for deep matching: lowercase, remove special characters, trim spaces
    const clean = (s) => cleanHTML(s || "").toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim();

    try {
        // ==========================================
        // 1. PERFORM 2 CONCURRENT QUERIES
        // ==========================================
        
        // Query 1: Exactly ?query=SongName&artist=ArtistName (Quotes replaced with &quot;)
        const targetApi1 = `https://ayushm-psi.vercel.app/api/search/songs?query=${encodeURIComponent(safeQ)}${safeArtist ? `&artist=${encodeURIComponent(safeArtist)}` : ""}`;
        
        // Query 2: Exactly ?query=SongName ArtistName
        const searchQueryCombined = `${safeQ} ${safeArtist}`.trim();
        const targetApi2 = `https://ayushm-psi.vercel.app/api/search/songs?query=${encodeURIComponent(searchQueryCombined)}`;
        
        // Helper to fetch and safely return results array
        const fetchResults = async (url) => {
            try {
                const response = await fetch(url);
                const data = await response.json();
                return (data.success && data.data?.results) ? data.data.results : [];
            } catch (err) {
                return[];
            }
        };

        // Fetch both APIs at exactly the same time
        const[results1, results2] = await Promise.all([
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
        const tTitle = clean(safeQ); 
        
        // Split provided artists by comma for deep individual matching
        const tArtistsArray = safeArtist ? safeArtist.split(',').map(a => clean(a)).filter(a => a) :[];
        
        let bestMatch = null; 
        let highestScore = 0;
        
        results.forEach(song => {
            if (!song) return;
            
            const rTitleOriginal = cleanHTML(song.name);
            const rTitle = clean(rTitleOriginal); 
            
            // Extract artists safely from JioSaavn structure
            const primaryArtists = song.artists?.primary || [];
            const featuredArtists = song.artists?.featured ||[];
            const rArtists = [...primaryArtists, ...featuredArtists].map(a => clean(a.name));
            
            let score = 0; 
            
            // --- STRICT TITLE SIMILARITY CHECK (> 70% Required) ---
            // Strip common brackets (like "(From Movie)") for a pure core title comparison
            const rTitleNoBrackets = clean(rTitleOriginal.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, ""));
            
            const sim1 = getLevenshteinSimilarity(tTitle, rTitle);
            const sim2 = getLevenshteinSimilarity(tTitle, rTitleNoBrackets);
            
            // Word level overlap for partial matches (e.g., query "Shape of" matching "Shape of you")
            const qWords = tTitle.split(' ').filter(Boolean);
            const tWords = rTitleNoBrackets.split(' ').filter(Boolean);
            let wordMatches = 0;
            
            if (qWords.length > 0 && tWords.length > 0) {
                qWords.forEach(qw => {
                    // Allow slight typos in individual words
                    if (tWords.some(tw => getLevenshteinSimilarity(qw, tw) >= 0.7)) {
                        wordMatches++;
                    }
                });
            }
            
            // Evaluate both depending on if user over-searched or under-searched
            const wordSimQuery = qWords.length > 0 ? wordMatches / qWords.length : 0;
            const wordSimTarget = tWords.length > 0 ? wordMatches / tWords.length : 0;
            
            // Max similarity across direct character match and token overlap match
            const maxTitleSim = Math.max(sim1, sim2, wordSimQuery, wordSimTarget);
            
            // STRICT CONDITION: Must be STRICTLY greater than 70%
            // "Better to not give instead of incorrect"
            if (maxTitleSim <= 0.70) {
                return; // Skips to the next iteration. Completely ignore this track.
            }
            
            // Base title score based on similarity
            score += (maxTitleSim * 100);
            
            // --- Artist Matching (DEEP ANALYSIS) ---
            if (tArtistsArray.length > 0) {
                let matchedAtLeastOneArtist = false;
                
                for (let ta of tArtistsArray) {
                    for (let ra of rArtists) { 
                        if (ra === ta) { 
                            score += 100; // Perfect match
                            matchedAtLeastOneArtist = true; 
                            break; 
                        } else if (ra.includes(ta) || ta.includes(ra)) { 
                            score += 80;  // Partial match
                            matchedAtLeastOneArtist = true; 
                            break; 
                        } else if (getLevenshteinSimilarity(ra, ta) >= 0.7) {
                            score += 60;  // Typo Match
                            matchedAtLeastOneArtist = true;
                            break;
                        }
                    }
                }
                
                // If ZERO artists matched out of the long list, penalize heavily.
                if (!matchedAtLeastOneArtist) {
                    score -= 50;
                }
            } else { 
                score += 50; // Base score if no artist was provided in query
            }
            
            // --- Set Best Match ---
            if (score > highestScore) { 
                highestScore = score; 
                bestMatch = song; 
            }
        });

        // Modified check strictly refusing any match passing through with a <=0 score
        if (highestScore <= 0 || !bestMatch) {
            return res.status(404).json({ error: "No exact match found. (Strict >70% filtering enabled)" });
        }

        // ==========================================
        // 4. RESPONSE FORMATTING
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
