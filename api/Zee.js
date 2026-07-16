export default async function handler(req, res) {
    // 1. Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

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
                // Mimic a real Chrome browser on a Windows PC
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
                // Tell the firewall we are coming from the official Zee5 website
                'Origin': 'https://www.zee5.com',
                'Referer': 'https://www.zee5.com/',
                // Standard browser fetch headers
                'Sec-Fetch-Site': 'same-site',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Dest': 'empty',
                'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"'
            },
            body: JSON.stringify({
                "x-access-token": "",  
                "Authorization": ""
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                success: false,
                error: `Zee5 API rejected the request with status: ${response.status}`,
                details: errorText
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
                full_response: data 
            });
        }

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'The Vercel function crashed.',
            message: error.message 
        });
    }
}
