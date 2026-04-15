export default async function handler(req, res) {
    // --- CORS Configuration ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // 1. Extract parameters
    const { q, artist } = req.query;

    if (!q) {
        return res.status(400).json({ error: "Please provide a song name (?q=)" });
    }

    // 2. Helper: String Normalizer (Removes symbols, "From Movie", extra spaces for comparison)
    const normalize = (str) => {
        if (!str) return "";
        return str.toLowerCase()
            .replace(/\(.*\)|\[.*\]/g, "") // Remove (From "Movie") or [Official Video]
            .replace(/[-–—]/g, " ")        // Replace dashes with spaces
            .replace(/[^a-z0-9 ]/g, "")    // Remove special symbols
            .replace(/\s+/g, " ")          // Collapse multiple spaces
            .trim();
    };

    try {
        // 3. Construct Search Query
        const searchQuery = artist ? `${q} ${artist}` : q;
        const targetApi = `https://ayushm-psi.vercel.app/api/search/songs?query=${encodeURIComponent(searchQuery)}`;
        
        const response = await fetch(targetApi);
        const data = await response.json();

        if (!data.success || !data.data?.results?.length) {
            return res.status(404).json({ error: "No matching song found." });
        }

        const results = data.data.results;

        // 4. Advanced Matching Logic
        const targetSongClean = normalize(q);
        const targetArtistClean = artist ? normalize(artist) : "";

        let bestMatch = results.find(song => {
            const songNameClean = normalize(song.name);
            const songArtistsClean = normalize([...song.artists.primary, ...song.artists.featured].map(a => a.name).join(" "));

            // Scenario A: If artist is provided separately, match both name and artist
            if (targetArtistClean) {
                const matchesTitle = songNameClean.includes(targetSongClean) || targetSongClean.includes(songNameClean);
                const matchesArtist = songArtistsClean.includes(targetArtistClean) || targetArtistClean.includes(songArtistsClean);
                return matchesTitle && matchesArtist;
            }

            // Scenario B: If only Q is provided (but contains artist), match against combined result
            return songNameClean.includes(targetSongClean) || (songNameClean + " " + songArtistsClean).includes(targetSongClean);
        });

        // Fallback to first result if strict matching fails
        const song = bestMatch || results[0];

        // 5. Format the Response
        const primaryArtists = song.artists.primary || [];
        const featuredArtists = song.artists.featured || [];
        const allArtists = [...primaryArtists, ...featuredArtists].map(a => a.name).join(", ");

        const bestBanner = song.image && song.image.length > 0 
            ? song.image[song.image.length - 1].url 
            : "";

        const filteredResponse = {
            Title: song.name,
            Artists: allArtists || "Unknown Artist",
            Bannerlink: bestBanner,
            PermaUrl: song.url,
            StreamLinks: song.downloadUrl || []
        };

        // 6. Caching & Performance
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
        return res.status(200).json(filteredResponse);

    } catch (error) {
        console.error("API Fetch Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
