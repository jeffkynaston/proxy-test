//
// proxy.js
//
const express = require('express');
const axios = require('axios');
const { URL } = require('url');

const app = express();

// We now store only the "relay" cookie. Example:
// cookieJar[instanceId][domain] = "relay=someValue"
const cookieJar = {};

/**
 * 1) CORS handling & logging
 *    - Dynamically set Access-Control-Allow-Origin for credentials
 *    - Access-Control-Allow-Credentials: true
 *    - Handle OPTIONS with 200
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Log incoming request
  console.log(`\n--- Incoming Request ----------------------------------`);
  console.log(`[${new Date().toISOString()}] [${req.method}] ${req.originalUrl}`);
  console.log(`Headers:`, req.headers);

  // Dynamically allow the requesting origin
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    // Indicate that we vary by Origin so caches don't incorrectly cache responses
    res.header('Vary', 'Origin');
  }

  // Allow credentials (necessary if your front-end is sending them)
  res.header('Access-Control-Allow-Credentials', 'true');

  // Add any custom headers you need to allow
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, x-boomtown-client-instance-id, acting-as, no-translate, platform-version, priority, time-zone, x-boomtown-csrf-token, x-request-id'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  // Quick response for OPTIONS preflight
  if (req.method === 'OPTIONS') {
    console.log('[CORS] OPTIONS request, sending 200...');
    return res.sendStatus(200);
  }

  next();
});

/**
 * 2) Use express.raw() to keep the request body intact
 */
app.use(express.raw({ type: () => true, limit: '50mb' }));

/**
 * 3) Proxy endpoint
 */
app.all('/proxy', async (req, res) => {
  try {
    // We expect ?url=<TARGET_URL>
    const target = req.query.url;
    if (!target) {
      console.log('Missing "url" query parameter.');
      return res.status(400).send('Missing "url" query parameter.');
    }

    // We also require x-boomtown-client-instance-id
    const instanceId = req.headers['x-boomtown-client-instance-id'];
    if (!instanceId) {
      console.log('Missing "x-boomtown-client-instance-id" header.');
      return res
        .status(400)
        .send('Missing "x-boomtown-client-instance-id" header.');
    }

    // Parse the target to figure out the domain for storing cookies
    const parsedUrl = new URL(target);
    const domain = parsedUrl.host;

    // Check if we already have a relay cookie for this instance+domain
    const relayCookie = cookieJar[instanceId]?.[domain] || null;

    // Clone the original request headers so we can modify them safely
    const headers = { ...req.headers };
    // Remove host to avoid conflicting values
    delete headers.host;
    
    // Create a separate set of headers for the outgoing request
    const outgoingHeaders = { 
        'x-boomtown-client-instance-id': req.headers['x-boomtown-client-instance-id'],
        'x-boomtown-csrf-token': req.headers['x-boomtown-csrf-token'],
        'x-request-id': req.headers['x-request-id'],
        'x-requested-with': 'XMLHttpRequest',
        accept: 'application/json',
        // 'time-zone': 'America/Los_Angeles',
     };
    // outgoingHeaders.origin = 'https://app.stage.goboomtown.com';
    // outgoingHeaders.referer = 'https://app.stage.goboomtown.com';
    delete outgoingHeaders.origin;
    delete outgoingHeaders.referer;
    console.log('[Headers] Created modified headers for outgoing request');

    // If we have a stored relay cookie, attach it
    if (relayCookie) {
      outgoingHeaders.cookie = relayCookie;
      console.log(`[Cookie] Sending relay cookie for domain "${domain}": ${relayCookie}`);
    } else {
      console.log(
        `[Cookie] No stored relay cookie for domain "${domain}" and instance "${instanceId}".`
      );
    }

    // Log outgoing request
    console.log(`--- Forwarding Request to Target ----------------------`);
    console.log(`[${req.method}] ${target}`);
    console.log(`Headers:`, outgoingHeaders);
    console.log(`Request Body Length: ${req.body.length} bytes`);
    try {
      // If JSON, parse to display it
      if (
        headers['content-type'] &&
        headers['content-type'].toLowerCase().includes('application/json')
      ) {
        console.log(`Request Body (JSON):`, JSON.parse(req.body.toString()));
      } else {
        // Otherwise show a snippet of raw body
        // console.log(
        //   `Request Body (raw, first 100 bytes):`,
        //   req.body.slice(0, 100).toString()
        // );
      }
    } catch (err) {
      console.log(`Could not parse request body as JSON. Logging raw snippet...`);
    //   console.log(
    //     `Request Body (raw, first 100 bytes):`,
    //     req.body.slice(0, 100).toString()
    //   );
    }

    // Forward to target
    const response = await axios({
      method: req.method,
      url: target,
      headers,
      data: req.body,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    // If target returns cookies, filter down to relay only
    if (response.headers['set-cookie']) {
      const setCookieArray = response.headers['set-cookie']; // array of strings

      // Find the first cookie that starts with "relay="
      const relayCookieString = setCookieArray.find(cookieStr =>
        cookieStr.toLowerCase().startsWith('relay=')
      );

      if (relayCookieString) {
        console.log(`[Cookie] Found relay cookie in Set-Cookie: ${relayCookieString}`);
        // The raw Set-Cookie might be something like "relay=someValue; Path=/; Secure; ..."
        // We only need "relay=someValue" for subsequent requests
        const [nameValue] = relayCookieString.split(';'); // "relay=someValue"
        // Save it
        cookieJar[instanceId] = cookieJar[instanceId] || {};
        cookieJar[instanceId][domain] = nameValue;

        console.log(`[Cookie] Storing relay cookie: ${nameValue}`);
      }
    }

    // Log response from target
    console.log(`--- Response From Target -----------------------------`);
    console.log(`[Status Code]: ${response.status}`);
    console.log(`Response Headers:`, response.headers);
    console.log(`Response Body Length: ${response.data.length} bytes`);
    
    // Parse response body based on content type
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      console.log('Response Body (JSON):', JSON.parse(response.data.toString()));
    } else if (contentType.includes('text/')) {
      // Handle text content types (text/plain, text/html, etc.)
      console.log('Response Body:', response.data.toString());
    } else {
      // For binary data, just show length
      console.log('Response Body: [Binary data]');
    }

    // Forward headers, skipping content-length & transfer-encoding
    Object.entries(response.headers).forEach(([key, value]) => {
      if (
        key.toLowerCase() === 'transfer-encoding' ||
        key.toLowerCase() === 'content-length'
      ) {
        return;
      }
      res.setHeader(key, value);
    });

    res.status(response.status).send(response.data);

  } catch (err) {
    console.error(`[Proxy Error] ${err.message}`);

    if (err.response) {
      // If axios got an error response from target, forward it
      console.log(`--- Error Response From Target -----------------------`);
      console.log(`[Status Code]: ${err.response.status}`);
      console.log(`Headers:`, err.response.headers);
      
      const errorContentType = err.response.headers['content-type'] || '';
      if (errorContentType.includes('application/json')) {
        console.log('Error Body (JSON):', JSON.parse(err.response.data.toString()));
      } else if (errorContentType.includes('text/')) {
        console.log('Error Body:', err.response.data.toString());
      } else {
        console.log('Error Body: [Binary data]');
      }

      Object.entries(err.response.headers).forEach(([key, value]) => {
        if (
          key.toLowerCase() === 'transfer-encoding' ||
          key.toLowerCase() === 'content-length'
        ) {
          return;
        }
        res.setHeader(key, value);
      });
      return res.status(err.response.status).send(err.response.data);
    }

    // Otherwise it's some other error (network, code bug, etc.)
    return res.status(500).send(err.message);
  }
});

/**
 * 4) Start listening on port 3005
 */
const PORT = 3005;
app.listen(PORT, () => {
  console.log(`\n**************************************************`);
  console.log(`Proxy server listening on port ${PORT}`);
  console.log(`**************************************************\n`);
});
