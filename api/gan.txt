export default async function handler(req, res) {
  // 1. CORS setup so you can call this from any frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Please provide a search query using ?q=YOUR_SEARCH" });
  }

  const encodedQuery = encodeURIComponent(query);

  // 2. Define the Mobile API endpoints for all 4 categories
  // We use the Mobile API because it easily bypasses the WAF blocking Vercel IPs
  const endpoints = {
    tracks: `https://api.gaana.com/index.php?type=search&subtype=search_song&key=${encodedQuery}`,
    albums: `https://api.gaana.com/index.php?type=search&subtype=search_album&key=${encodedQuery}`,
    artists: `https://api.gaana.com/index.php?type=search&subtype=search_artist&key=${encodedQuery}`,
    playlists: `https://api.gaana.com/index.php?type=search&subtype=search_playlist&key=${encodedQuery}`
  };

  // 3. Spoof the Official Android App to stay unblocked
  const headers = {
    "User-Agent": "GaanaAndroidApp/5.0",
    "Accept": "application/json, text/plain, */*",
    "deviceId": "841f9afd-387f-44d9-bea7-b770a886ef50", 
    "deviceType": "GaanaAndroidApp" 
  };

  try {
    // Helper function to safely fetch and parse JSON
    const fetchCategory = async (url) => {
      try {
        const response = await fetch(url, { method: "GET", headers });
        // Fetch raw text first to avoid JSON parse crashing on empty responses
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      } catch (err) {
        return null; // Fail gracefully if one specific category errors out
      }
    };

    // 4. Execute all 4 searches at the exact same time (Very Fast)
    const [tracksData, albumsData, artistsData, playlistsData] = await Promise.all([
      fetchCategory(endpoints.tracks),
      fetchCategory(endpoints.albums),
      fetchCategory(endpoints.artists),
      fetchCategory(endpoints.playlists)
    ]);

    // 5. Aggregate everything into a single, clean response
    const combinedData = {
      success: true,
      query: query,
      counts: {
        tracks: parseInt(tracksData?.count) || 0,
        albums: parseInt(albumsData?.count) || 0,
        artists: parseInt(artistsData?.count) || 0,
        playlists: parseInt(playlistsData?.count) || 0
      },
      results: {
        tracks: tracksData?.tracks || [],
        albums: albumsData?.album ||[],
        artists: artistsData?.artist || [],
        playlists: playlistsData?.playlist ||[]
      }
    };

    return res.status(200).json(combinedData);

  } catch (error) {
    return res.status(500).json({ 
      error: "Failed to fetch aggregated search data", 
      details: error.message 
    });
  }
}
