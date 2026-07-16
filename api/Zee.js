const http = require('http');

const PORT = 3000;

const server = http.createServer(async (req, res) => {
    // 1. Parse the incoming request URL
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);

    // We only process requests to the root path "/"
    if (reqUrl.pathname === '/') {
        // Get the 'c' parameter from the URL (e.g., ?c=channel_id)
        const channel = reqUrl.searchParams.get('c');

        if (!channel) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Error: Channel parameter "c" is required.');
        }

        const targetUrl = `https://spapi.zee5.com/singlePlayback/getDetails/secure?channel_id=${channel}&device_id=ff6a6d41-28fb-49c2-917f-0f51d5521835&platform_name=mobile_web&translation=en&user_language=hi&country=IN&state=UP&app_version=4.5.1&user_type=premium&check_parental_control=false&gender=Male&age_group=25-32&uid=378f3a58-4284-4a38-9d2d-f6769c0db4aa&ppid=ff6a6d41-28fb-49c2-917f-0f51d5521835&version=12`;

        try {
            // 2. Make the POST request (Native fetch is built into Node 18+)
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

            // 3. Extract the data just like your PHP code
            const image = data?.assetDetails?.image_url || '';
            const img = image.replace('270x152', '1170x658');
            const title = data?.assetDetails?.title;
            const des = data?.assetDetails?.description;
            const playit = data?.keyOsDetails?.video_token;

            if (playit) {
                // 4. Redirect exactly like: header("Location: $playit");
                res.writeHead(302, { 'Location': playit });
                res.end();
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Stream not found or token is invalid.');
            }

        } catch (error) {
            console.error('API Error:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    } else {
        // Handle undefined routes
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running natively! Test it at http://localhost:${PORT}/?c=YOUR_CHANNEL_ID`);
});
