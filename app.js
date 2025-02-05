const express = require('express')
const https = require('https')
const cors = require('cors')
const multer = require('multer')
const upload = multer()

const TARGET = 'app.stage.goboomtown.com'

// In-memory cookie storage
const cookieStore = {
  cookies: [],
  setCookie(cookieHeader) {
    // Parse the cookie string to get just the name=value part
    const cookieString = cookieHeader.split(';')[0]
    
    // Remove existing cookie with same name if it exists
    const cookieName = cookieString.split('=')[0]
    this.cookies = this.cookies.filter(cookie => 
      !cookie.startsWith(cookieName + '=')
    )
    
    // Add the new cookie
    this.cookies.push(cookieString)
  },
  getCookieHeader() {
    return this.cookies.join('; ')
  }
}

const app = express()

app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: '*',
  exposedHeaders: ['set-cookie', 'Set-Cookie']
}))

// Add a middleware to ensure CORS headers are present
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

// Parse different types of request bodies
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(upload.any())

app.use('/api', (req, res) => {
  console.log(`Forwarding ${req.method} ${req.originalUrl}`)

  // Build the options for the forwarded request
  const options = {
    hostname: TARGET,
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: TARGET // Override the host header
    }
  }

  // Add JSON headers only for GET requests that aren't userLogin
  if (!req.originalUrl.includes('userLogin')) {
    console.log('----------- Adding JSON headers for GET request')
    options.headers['Accept'] = 'application/json';
    options.headers['Content-Type'] = 'application/json';
  }

  // Add stored cookies to the request
  if (cookieStore.cookies.length > 0) {
    options.headers['cookie'] = cookieStore.getCookieHeader()
  }

  // Create the forwarded request
  const proxyReq = https.request(options, (proxyRes) => {
    // Copy status code
    res.status(proxyRes.statusCode)
    
    // Store any new cookies from the response
    const setCookieHeaders = proxyRes.headers['set-cookie']
    if (setCookieHeaders) {
      setCookieHeaders.forEach(cookie => {
        cookieStore.setCookie(cookie)
      })
    }
    
    // Copy headers
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key])
    })

    // Pipe the response data
    proxyRes.pipe(res)
  })

  // Handle errors
  proxyReq.on('error', (error) => {
    console.error('Proxy error:', error)
    res.status(500).send('Proxy error: ' + error.message)
  })

  // Handle request body based on content type
  if (req.body) {
    if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      // Handle URL encoded form data
      const formData = new URLSearchParams(req.body).toString()
      proxyReq.write(formData)
    } else if (req.headers['content-type']?.includes('multipart/form-data')) {
      // Handle multipart form data
      if (req.files) {
        // If there are files in the request
        const boundary = Math.random().toString(16)
        const contentType = `multipart/form-data; boundary=${boundary}`
        proxyReq.setHeader('Content-Type', contentType)

        // Write form fields
        Object.keys(req.body).forEach(key => {
          proxyReq.write(`--${boundary}\r\n`)
          proxyReq.write(`Content-Disposition: form-data; name="${key}"\r\n\r\n`)
          proxyReq.write(`${req.body[key]}\r\n`)
        })

        // Write files
        req.files.forEach(file => {
          proxyReq.write(`--${boundary}\r\n`)
          proxyReq.write(`Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.originalname}"\r\n`)
          proxyReq.write(`Content-Type: ${file.mimetype}\r\n\r\n`)
          proxyReq.write(file.buffer)
          proxyReq.write('\r\n')
        })

        proxyReq.write(`--${boundary}--\r\n`)
      }
    } else if (Object.keys(req.body).length > 0) {
      // Handle JSON data
      const bodyData = JSON.stringify(req.body)
      proxyReq.write(bodyData)
    }
  }

  // End the forwarded request
  proxyReq.end()
})

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
