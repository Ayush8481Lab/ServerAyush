export default async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.status(200).end();

    let { q, artist } = req.query;
    if (!q) return res.status(400).json({ error: "Missing query parameter 'q'" });

    // 1. Helper: Clean HTML and Normalize
    const cleanHTML = (str) => str ? str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&rsquo;/g, "'") : "";
    
    // Normalize: lowercase and remove symbols (keeps only alphanumeric)
    const normalize = (str) => cleanHTML(str).toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
        // 2. Dual-Format Search Construction
        // We search with both Song + Artist to ensure the API returns the correct pool of songs
        const searchQuery = artist ? `${q} ${artist}` : q;
        const targetApi = `https://ayushm-psi.vercel.app/api/search/songs?query=${encodeURIComponent(cleanHTML(searchQuery))}`;
        
        const response = await fetch(targetApi);
        const data = await response.json();

        if (!data.success || !data.data?.results?.length) {
            return res.status(404).json({ error: "No matching song found." });
        }

        const results = data.data.results;
        const targetTitleClean = normalize(q);
        const targetArtistClean = artist ? normalize(artist) : "";

        // 3. DEEP ANALYSIS SCORING
        let highscore = -1000; // Start low to allow for penalties
        let bestMatch = results[0];

        results.forEach((song) => {
            let score = 0;
            const apiTitleOriginal = cleanHTML(song.name);
            const apiTitleClean = normalize(song.name);
            const apiArtistsClean = normalize([...song.artists.primary, ...song.artists.featured].map(a => a.name).join(' '));

            // --- PRIORITY 1: TITLE MATCHING ---
            if (apiTitleClean === targetTitleClean) {
                score += 500; // HUGE bonus for exact string match
            } else if (apiTitleClean.includes(targetTitleClean)) {
                score += 100; // Partial match
            }

            // --- PRIORITY 2: THE "REMIX" PENALTY ---
            // If the user DID NOT search for 'remix' or 'lofi', but the result HAS 'remix' or 'lofi'
            const keywords = ['remix', 'lofi', 'reverb', 'slowed', 'cover'];
            keywords.forEach(word => {
                const isWordInTarget = targetTitleClean.includes(word);
                const isWordInApi = apiTitleClean.includes(word);
                
                if (isWordInApi && !isWordInTarget) {
                    score -= 200; // Penalize "Remix" if user wanted "Original"
                }
            });

            // --- PRIORITY 3: ARTIST MATCHING ---
            if (targetArtistClean) {
                if (apiArtistsClean.includes(targetArtistClean)) {
                    score += 150;
                }
            }

            // --- PRIORITY 4: LENGTH PROXIMITY ---
            // An original song title is usually shorter than "Song Name (From Movie) [Remix]"
            // We favor the one closest in length to our query
            const lengthDiff = Math.abs(apiTitleClean.length - targetTitleClean.length);
            score -= lengthDiff; // Smaller difference = higher score

            // Update winner
            if (score > highscore) {
                highscore = score;
                bestMatch = song;
            }
        });

        // 4. Final Response Construction
        const song = bestMatch;
        const allArtists = [...song.artists.primary, ...song.artists.featured]
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
            StreamLinks: song.downloadUrl || []
        };

        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        return res.status(200).json(filteredResponse);

    } catch (error) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
