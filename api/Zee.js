export default async function handler(req, res) {
    // 1. Set CORS headers so your frontend/player can fetch this without errors
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. Get the channel parameter
    const channel = req.query.c;

    if (!channel) {
        return res.status(400).json({ error: 'Channel parameter "c" is required.' });
    }

    const targetUrl = `https://spapi.zee5.com/singlePlayback/getDetails/secure?channel_id=${channel}&device_id=ff6a6d41-28fb-49c2-917f-0f51d5521835&platform_name=mobile_web&translation=en&user_language=hi&country=IN&state=UP&app_version=4.5.1&user_type=premium&check_parental_control=false&gender=Male&age_group=25-32&uid=378f3a58-4284-4a38-9d2d-f6769c0db4aa&ppid=ff6a6d41-28fb-49c2-917f-0f51d5521835&version=12`;

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "x-access-token": "",  
                "Authorization": ""
            })
        });

        const data = await response.json();

        // 3. Extract the variables exactly like your PHP script did
        const image = data?.assetDetails?.image_url || '';
        const img = image.replace('270x152', '1170x658');
        const title = data?.assetDetails?.title || '';
        const des = data?.assetDetails?.description || '';
        const playit = data?.keyOsDetails?.video_token || '';

        // 4. Return the JSON response
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
                error: 'Stream not found or token is invalid.' 
            });
        }

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal Server Error' 
        });
    }
}
