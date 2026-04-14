export default async function handler(req, res) {
  // 1. Extract 'q' (song name) and 'artist' from the URL query
  const { q, artist } = req.query;

  // 2. Validate input
  if (!q) {
    return res.status(400).json({ error: "Please provide a song name using the ?q= parameter." });
  }

  try {
    // 3. Combine query for Best Match (e.g., "Believer Imagine Dragons")
    const searchQuery = artist ? `${q} ${artist}` : q;
    
    // 4. Fetch data from the provided API
    const targetApi = `https://ayushm-psi.vercel.app/api/search/songs?query=${encodeURIComponent(searchQuery)}`;
    const response = await fetch(targetApi);
    const data = await response.json();

    // 5. Check if results exist
    if (!data.success || !data.data || !data.data.results || data.data.results.length === 0) {
      return res.status(404).json({ error: "No matching song found." });
    }

    // 6. Get the absolute best match (First result)
    const song = data.data.results[0];

    // 7. Format the Artists (Primary + Featured separated by comma)
    const primaryArtists = song.artists.primary ||[];
    const featuredArtists = song.artists.featured || [];
    const allArtists = [...primaryArtists, ...featuredArtists]
      .map(a => a.name)
      .join(", ");

    // 8. Get the highest quality Bannerlink (Usually the last element in the array like 500x500)
    const bestBanner = song.image && song.image.length > 0 
      ? song.image[song.image.length - 1].url 
      : "";

    // 9. Format response exactly as you requested
    const filteredResponse = {
      Title: song.name,
      Artists: allArtists || "Unknown Artist",
      Bannerlink: bestBanner,
      PermaUrl: song.url,
      StreamLinks: song.downloadUrl ||[]
    };

    // 10. (Crucial for Low Latency) Cache the result on Vercel's Edge Network for 24 hours
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');

    // Return the response
    return res.status(200).json(filteredResponse);

  } catch (error) {
    console.error("API Fetch Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
