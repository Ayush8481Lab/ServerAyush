export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  // 1. Your cookies in JSON format (easy to update later if they expire)
  const cookieJson = [
    { "name": "_fbp", "value": "fb.1.1785327084836.754731018580690365" },
    { "name": "preferredLang", "value": "hindi" },
    { "name": "CloudFront-Signature", "value": "VwCKTcwD2F9-bNQdclGbjCXnemYGkQ7ZlxMvU7m-MjgqCh5vQwd9LfQgPx6zJPxDu4i~RZdthp4jO3coIsvym~lMYqmqatbpTkZ9SIkw1LoVYpEl7mt3nbP52Bm2hhwucLMUNj2~bbEZuNvU4xmQvKjvhPdz-R1EmMwWX3fV4PO6AFGPiQFBPYjy1lBQIfCplFpyukHuwWQbnVDEcdPn9qSsPtioQkwlAV3j1ipUASvn654CeUF8qrUVh9D3sk9iI8rsX3KqZpu8BCkWldHaqNuyhXsLSswmbS8yw2MaIh2ntM9issNM3eptXzjtQbEBuBj5q5x9YofsxIBMQZs5~Q__" },
    { "name": "_gcl_au", "value": "1.1.602972533.1785327083" },
    { "name": "_gcl_aw", "value": "GCL.1785327237.CjwKCAjwyabTBhBFEiwAM3mNUAef-up7eB0G9WCZiRCPVS_3UFdEbsTHywdx4StEmPceY_J38bCaKhoCBAoQAvD_BwE" },
    { "name": "jwtToken", "value": "eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozNzUxMjk1NjgsImV4cCI6MTc4NjYyMzU3NywidW5pcXVlX2lkIjoiMWRmOTgwM2ItMzkxZC00YjBkLThlNzctOTMxOGNjYmRjODMxIn0.Vm6ClBDkfkAhUWWXnxFhKufGWgG_dNOobvHbiQUYqxu7HzZ-OOm7k30WVenedkZKmQ8YwEcg3wgpSEEUrjmnlA" },
    { "name": "_ga", "value": "GA1.1.2139426549.1785327084" },
    { "name": "_ga_S16VQXJEBE", "value": "GS2.1.s1785327083$o1$g1$t1785327583$j57$l0$h0" },
    { "name": "_gcl_gs", "value": "2.1.k1$i1785327080$u234687327" },
    { "name": "cdn_cookie_created_at", "value": "\"2026-07-29 12:13:37+00:00\"" },
    { "name": "cdn_cookie_expires_at", "value": "\"2026-07-29 14:13:37+00:00\"" },
    { "name": "CloudFront-Key-Pair-Id", "value": "K2ZMC0VBPI9ZOX" },
    { "name": "CloudFront-Policy", "value": "eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9tZWRpYS5jZG4ua3VrdWZtLmNvbS8qIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzg1MzM0NDE3fX0sIkN1c3RvbURhdGEiOnsidXNlcl9pZCI6Mzc1MTI5NTY4fX1dfQ__" },
    { "name": "guest_user_id", "value": "fbd1272b-5ecb-48d6-a2b6-d640fdd5664e" },
    { "name": "has_strip_banner", "value": "false" }
  ];

  // 2. Convert the JSON array into the HTTP Header format the server accepts
  // This turns it into: "name1=value1; name2=value2;"
  const cookieString = cookieJson.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

  try {
    const targetUrl = new URL(url);

    // 3. Attach all required headers, including the formatted cookies and referer
    const fetchOptions = {
      method: 'GET',
      headers: {
        'preferred-lang': 'hindi',
        'referer': 'https://kukutv.app/watch/gaonwala-super-husband?episode=episode-10-4103',
        'x-source-service': 'nodejs-web',
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
        'package-name': 'com.vlv.web.reels',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'cookie': cookieString // Uses the converted string from above
      },
      redirect: 'follow', 
    };

    // 4. Fetch the data from the target API
    const response = await fetch(targetUrl.toString(), fetchOptions);

    // 5. Read the response body based on content type
    const contentType = response.headers.get('content-type') || '';
    let data;
    
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // 6. Set CORS headers so your frontend app can read the API response
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    // 7. Return the data to the user
    return res.status(response.status).send(data);

  } catch (error) {
    console.error('Proxy Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch the requested resource' });
  }
}
