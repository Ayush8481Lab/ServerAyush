export default async function handler(req, res) {
    // 1. Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. Check for channel ID
    const channel = req.query.c;
    if (!channel) {
        return res.status(400).json({ success: false, error: 'Channel parameter "c" is required.' });
    }

    const targetUrl = `https://spapi.zee5.com/singlePlayback/getDetails/secure?channel_id=${channel}&device_id=ff6a6d41-28fb-49c2-917f-0f51d5521835&platform_name=mobile_web&translation=en&user_language=hi&country=IN&state=UP&app_version=4.5.1&user_type=premium&check_parental_control=false&gender=Male&age_group=25-32&uid=378f3a58-4284-4a38-9d2d-f6769c0db4aa&ppid=ff6a6d41-28fb-49c2-917f-0f51d5521835&version=12`;

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Added a User-Agent to prevent Zee5 from blocking the request as a bot
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
                "x-access-token": "",  
                "Authorization": ""
            })
        });

        // DEBUG: Check if Zee5 blocked the request (e.g., 403 Forbidden)
        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                success: false,
                error: `Zee5 API rejected the request with status: ${response.status}`,
                details: errorText // This will show us WHY Zee5 blocked it
            });
        }

        const data = await response.json();

        const image = data?.assetDetails?.image_url || '';
        const img = image.replace('270x152', '1170x658');
        const title = data?.assetDetails?.title || '';
        const des = data?.assetDetails?.description || '';
        const playit = data?.keyOsDetails?.video_token || '';

        if (playit) {
            return res.status(200).json({
                success: true,
                title: title,
                description: des,
                image: img,
                stream_url: playit
            });
        } else {
            return res.status(404).json({ 
                success: false, 
                error: 'Data fetched successfully, but no stream_url (video_token) was found in the response.',
                full_response: data // Shows exactly what Zee5 sent back so you can inspect it
            });
        }

    } catch (error) {
        // This will print the EXACT Javascript error if something crashes
        console.error('API Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'The Vercel function crashed.',
            message: error.message 
        });
    }
}
