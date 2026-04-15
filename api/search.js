export default async function handler(req, res) {
    // --- CORS ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') return res.status(200).end();

    let { q, artist } = req.query;
    if (!q) return res.status(400).json({ error: "Missing query parameter 'q'" });

    // 1. Better Decoding & Normalization
    const cleanHTML = (str) => str ? str.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&rsquo;/g, "'") : "";
    
    // Normalize for comparison: lowercase and remove symbols, but keep letters/numbers
    const normalize = (str) => cleanHTML(str).toLowerCase().replace(/[^a-z0-9]/g, '');

    try {
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

        // 2. SCORING SYSTEM (Deep Analysis)
        let highscore = -1;
        let bestMatch = results[0];

        results.forEach((song) => {
            let currentScore = 0;
            const apiTitleClean = normalize(song.name);
            const apiArtistsClean = normalize([...song.artists.primary, ...song.artists.featured].map(a => a.name).join(' '));

            // TITLE SCORING (Priority 1)
            if (apiTitleClean === targetTitleClean) {
                currentScore += 100; // Perfect Title match
            } else if (apiTitleClean.includes(targetTitleClean) || targetTitleClean.includes(apiTitleClean)) {
                currentScore += 50; // Partial Title match
            }

            // ARTIST SCORING (Priority 2)
            if (targetArtistClean) {
                if (apiArtistsClean.includes(targetArtistClean) || targetArtistClean.includes(apiArtistsClean)) {
                    currentScore += 30; // Artist match
                }
            }

            // Update best match if this score is higher
            if (currentScore > highscore) {
                highscore = currentScore;
                bestMatch = song;
            }
        });

        // 3. Format Final Response using the Winner
        const song = bestMatch;
        const allArtists = [...song.artists.primary, ...song.artists.featured]
            .map(a => cleanHTML(a.name))
            .join(", ");

        const bestBanner = song.image && song.image.length > 0 
            ? song.image[song.image.length - 1].url 
            : "";

        // Use the original name from the API so we don't lose "(From Dhurandhar)"
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
