// pages/api/meta.js

export default async function handler(req, res) {
  // Pass: /api/meta?id=TRACK_ID&seo=SEOKEY&token=AK47_TOKEN&cid=CLIENT_ID
  const { id, seo, token, cid } = req.query;

  if (!id && !seo) {
    return res.status(400).json({ error: "Please provide a Gaana track id or seo key." });
  }

  try {
    const trackId = id || seo;

    // ==========================================
    // 1. FETCH GAANA TRACK INFO
    // ==========================================
    const gaanaRes = await fetch(`https://gaanaayush.vercel.app/api/superserch/track/info?track_id=${trackId}`, { referrerPolicy: "no-referrer" });
    if (!gaanaRes.ok) throw new Error("Failed to fetch Gaana track info");
    
    const gaanaJson = await gaanaRes.json();
    const gaanaData = gaanaJson.data;
    if (!gaanaData) throw new Error("Track not found on Gaana");

    // Extract precise Title & Artists to map with Spotify
    const decodeEntities = (t) => (t||"").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#39;/g, "'");
    const title = decodeEntities(gaanaData.track_title || gaanaData.title || gaanaData.name || "Unknown");
    
    let artistNames =[];
    if (gaanaData.entity_info) {
       const artistInfo = gaanaData.entity_info.find(info => info.key === 'artist' || info.key === 'singers');
       if (artistInfo && Array.isArray(artistInfo.value)) artistNames = artistInfo.value.map(a => a.name);
    }
    if (artistNames.length === 0) {
       if (Array.isArray(gaanaData.artist)) artistNames = gaanaData.artist.map(a => a.name);
       else if (Array.isArray(gaanaData.singers)) artistNames = gaanaData.singers.map(a => a.name);
    }
    const artist = artistNames.length > 0 ? decodeEntities(artistNames.join(", ")) : "Unknown Artist";

    // ==========================================
    // 2. FETCH SPOTIFY MATCH (AK47 API)
    // ==========================================
    let spotifyId = null;
    let spotifyUrl = null;

    if (token) {
       const searchArtist = artistNames.slice(0, 2).join(' '); // Use max 2 artists for better search hit rate
       const query = `${title} ${searchArtist}`.trim();
       const clientIdParam = cid ? `&CID=${cid}` : ''; 
       
       const searchRes = await fetch(`https://ak47ayush.vercel.app/search?q=${encodeURIComponent(query)}${clientIdParam}&token=${token}&limit=10&offset=0`);
       
       if (searchRes.ok) {
           const searchJson = await searchRes.json();
           const results = searchJson.results || (searchJson.tracks && searchJson.tracks.items) ||[];
           
           // Fast Matcher Algorithm
           const match = performMatching(results, title, searchArtist);
           if (match) {
               spotifyId = match.id || (match.spotify_url && match.spotify_url.split('/track/')[1]?.split('?')[0]) || (match.external_urls && match.external_urls.spotify?.split('/track/')[1]?.split('?')[0]);
               spotifyUrl = match.spotify_url || (match.external_urls && match.external_urls.spotify) || `https://open.spotify.com/track/${spotifyId}`;
           }
       }
    }

    // ==========================================
    // 3. FETCH LYRICS & CANVAS SIMULTANEOUSLY
    // ==========================================
    let lyricsData = { lines:[], syncType: "UNSYNCED" };
    let canvasData = null;

    // Use Promise.all to fetch both APIs concurrently (Makes the API 2x Faster)
    if (spotifyId && spotifyUrl) {
        const lyricsReq = fetch(`https://lyr-nine.vercel.app/api/lyrics?url=${encodeURIComponent(spotifyUrl)}&format=lrc`)
            .then(res => res.ok ? res.json() : null).catch(() => null);
            
        const canvasReq = fetch(`https://ayush-gamma-coral.vercel.app/api/canvas?trackId=${spotifyId}`)
            .then(res => res.ok ? res.json() : null).catch(() => null);

        const[lyricsRes, canvasRes] = await Promise.all([lyricsReq, canvasReq]);

        // Process Lyrics
        if (lyricsRes && lyricsRes.lines) {
           lyricsData = {
              syncType: lyricsRes.syncType,
              lines: lyricsRes.lines.map(l => ({
                 time: parseTimeTag(l.timeTag),
                 words: l.words
              }))
           };
        }

        // Process Canvas
        if (canvasRes && canvasRes.canvasesList && canvasRes.canvasesList.length > 0) {
           canvasData = canvasRes.canvasesList[0];
        }
    }

    // ==========================================
    // 4. RETURN MERGED PAYLOAD
    // ==========================================
    return res.status(200).json({
        success: true,
        identifiers: {
           gaana_id: trackId,
           spotify_id: spotifyId,
           spotify_url: spotifyUrl
        },
        track_info: gaanaData,
        lyrics: lyricsData,
        canvas: canvasData
    });

  } catch (error) {
     console.error("Meta Extraction Failed:", error);
     return res.status(500).json({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// HELPER FUNCTIONS
// ---------------------------------------------------------

const parseTimeTag = (tag) => {
  if (!tag) return 0;
  const parts = tag.split(':');
  if (parts.length >= 2) return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  return 0;
};

// Extracted string matching algorithm adapted for the backend
const performMatching = (results, targetTrack, targetArtist) => {
  if (!results || results.length === 0) return null;
  
  const clean = (s) => (s || "").toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ").trim();
  const tTitle = clean(targetTrack);
  const tArtist = clean(targetArtist);
  
  let bestMatch = null;
  let highestScore = 0;

  for (const track of results) {
      if (!track) continue;
      const rTitle = clean(track.song_name || track.name);
      
      let rArtists = "";
      if (track.artist && typeof track.artist === 'string') rArtists = clean(track.artist);
      else if (track.artists && Array.isArray(track.artists)) rArtists = track.artists.map(a => clean(a.profile?.name || a.name)).join(" ");

      let score = 0;
      let artistMatched = false;

      if (tArtist.length > 0) {
          if (rArtists === tArtist) { score += 100; artistMatched = true; }
          else if (rArtists.includes(tArtist) || tArtist.includes(rArtists)) { score += 80; artistMatched = true; }
          else {
              const tSplit = tArtist.split(" ");
              for (let t of tSplit) {
                  if (t.length > 2 && rArtists.includes(t)) { score += 50; artistMatched = true; break; }
              }
          }
          if (!artistMatched) score = 0;
      } else {
          score += 50;
      }

      if (score > 0) {
          if (rTitle === tTitle) score += 100;
          else if (rTitle.startsWith(tTitle) || tTitle.startsWith(rTitle)) score += 80;
          else if (rTitle.includes(tTitle) || tTitle.includes(rTitle)) score += 50;
      }

      if (score > highestScore) {
          highestScore = score;
          bestMatch = track;
      }
  }
  
  // Return the best match. If the score is too low, just default to the first result
  return highestScore > 0 ? bestMatch : results[0];
};
