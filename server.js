const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

/**
 * 1) CORS Middleware
 *    - Allows only http://localhost:5174
 *    - If you do NOT need to send/receive cookies from the browser, you can remove Access-Control-Allow-Credentials.
 */
app.use((req, res, next) => {
  const ALLOWED_ORIGIN = 'http://localhost:5174';

  // If the incoming request's Origin is exactly http://localhost:5174, allow it
  if (req.headers.origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    // If you need cookies or other credentials in the request:
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Allow the browser to send these headers
  // (Add or remove headers if your client needs more/less)
  res.setHeader(
    'Access-Control-Allow-Headers',
    [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'x-boomtown-client-instance-id',
      'x-boomtown-csrf-token',
      'acting-as',
      'no-translate',
      'platform-version',
      'priority',
      'time-zone',
      'x-request-id'
    ].join(', ')
  );

  // Allow these methods
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');

  // Immediately respond to OPTIONS preflight with 200
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

/**
 * 2) Proxy /api -> https://app.stage.goboomtown.com
 *    - No body parsing => keeps multipart/form-data intact
 */
app.use(
  '/api',
  createProxyMiddleware({
    target: 'https://app.stage.goboomtown.com',
    changeOrigin: true
  })
);

/**
 * 3) Start on port 3005
 */
app.listen(3005, () => {
  console.log('Proxy server listening on http://localhost:3005');
});
