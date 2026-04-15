export default async function handler(req, res) {
    // --- CORS Configuration ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Extract and Decode Query
    let { q, artist } = req.query;

    if (!q) {
        return res.status(400).json({ error: "Please provide a song name (?q=)" });
    }

    // Helper: Clean HTML entities and symbols for display/matching
    const decodeEntities = (str) => {
        if (!str) return "";
        return str
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#039;/g, "'")
            .replace(/&rsquo;/g, "'");
    };

    // Helper: Normalize strings for "Perfect Match" comparison
    const normalize = (str) => {
        return decodeEntities(str)
            .toLowerCase()
            .replace(/\(from\s+.*?\)/gi, '') // Remove (From "Movie Name")
            .replace(/\(official.*?\)/gi, '') // Remove (Official Video/Audio)
            .replace(/[^a-z0-9]/gi, '')      // Remove all symbols and spaces
            .trim();
    };

    try {
        // 2. Build Search Query (Merging q and artist if available)
        const searchQuery = artist ? `${q} ${artist}` : q;
        const targetApi = `https://ayushm-psi.vercel.app/api/search/songs?query=${encodeURIComponent(decodeEntities(searchQuery))}`;
        
        const response = await fetch(targetApi);
        const data = await response.json();

        if (!data.success || !data.data?.results?.length) {
            return res.status(404).json({ error: "No matching song found." });
        }

        const results = data.data.results;
        const targetSongClean = normalize(q);
        const targetArtistClean = artist ? normalize(artist) : "";

        // 3. Deep Analysis Matching
        // We look for the result where the title and artist match best
        let bestMatch = results.find(song => {
            const apiSongName = normalize(song.name);
            const apiArtists = normalize([...song.artists.primary, ...song.artists.featured].map(a => a.name).join(''));

            if (targetArtistClean) {
                // Case: User provided song AND artist separately
                const titleMatch = apiSongName.includes(targetSongClean) || targetSongClean.includes(apiSongName);
                const artistMatch = apiArtists.includes(targetArtistClean) || targetArtistClean.includes(apiArtists);
                return titleMatch && artistMatch;
            } else {
                // Case: User put everything in 'q'
                return apiSongName.includes(targetSongClean) || (apiSongName + apiArtists).includes(targetSongClean);
            }
        });

        // Fallback to the first result if the deep match is too strict
        const song = bestMatch || results[0];

        // 4. Format Response
        const primaryArtists = song.artists.primary || [];
        const featuredArtists = song.artists.featured || [];
        const allArtists = [...primaryArtists, ...featuredArtists]
            .map(a => decodeEntities(a.name))
            .join(", ");

        const bestBanner = song.image && song.image.length > 0 
            ? song.image[song.image.length - 1].url 
            : "";

        const filteredResponse = {
            Title: decodeEntities(song.name),
            Artists: allArtists || "Unknown Artist",
            Bannerlink: bestBanner,
            PermaUrl: song.url,
            StreamLinks: song.downloadUrl || []
        };

        // 5. Cache and Return
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        return res.status(200).json(filteredResponse);

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
