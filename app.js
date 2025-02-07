const express = require('express')
const cors = require('cors')
const axios = require('axios')
const { v4: uuidv4 } = require('uuid')

const app = express()

// Simple CORS configuration - open to all
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: '*'
}))

// Basic middleware
app.use(express.json())

// Store auth tokens (in memory for now - should use proper storage in production)
let authTokens = {
  cookies: null,
  csrfToken: null
}
// b04851ea-0032-41a8-8cf9-cb2766ac00eb
const instanceId = uuidv4()
console.log('Instance ID:', instanceId)

// Helper function for login
async function loginToBoomtown() {
  const requestId = uuidv4()

  try {
    const loginResponse = await axios({
      method: 'post',
      url: 'https://app.stage.goboomtown.com/api/core/?sAction=userLogin',
      headers: {
        'accept': '*/*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'origin': 'https://app.stage.goboomtown.com',
        'platform-version': '2',
        'x-boomtown-client-instance-id': instanceId,
        'x-request-id': requestId,
        'x-requested-with': 'XMLHttpRequest'
      },
      data: 'email=alan%40smarttech.com&password=B00mtown1!',
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 303
    })

    
    // Store initial cookies and CSRF token
    const cookies = loginResponse.headers['set-cookie']
    console.log('Login response cookies:', cookies)
    let initialCsrfToken = loginResponse.data['csrf_token']
    console.log('Login response csrf token:', initialCsrfToken)

    // Make the userStatus call to get the updated CSRF token
    // const statusRequestId = uuidv4()
    const relayCookie = getRelayCookie(cookies)
    console.log('Relay cookie:', relayCookie)
    
    // const statusResponse = await axios({
    //   method: 'get',
    //   url: 'https://app.stage.goboomtown.com/api/core/?sAction=userStatus',
    //   headers: {
    //     'accept': '*/*',
    //     'accept-language': 'en-US,en;q=0.9',
    //     // 'acting-as': '',
    //     // 'no-translate': '',
    //     'platform-version': '2',
    //     'priority': 'u=1, i',
    //     'cookie': relayCookie,
    //     'referer': 'https://app.stage.goboomtown.com/',
    //     'origin': 'https://app.stage.goboomtown.com',
    //     'x-boomtown-client-instance-id': instanceId,
    //     'x-boomtown-csrf-token': initialCsrfToken,
    //     'x-request-id': statusRequestId,
    //     'x-requested-with': 'XMLHttpRequest',
    //     'time-zone': 'America/Los_Angeles',
    //     'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
    //   }
    // })

    // console.log('Status response data:', JSON.stringify(statusResponse.data, null, 2))

    // // Store the final CSRF token from the status response
    // const finalCsrfToken = statusResponse.data.csrf_token

    authTokens = {
      cookies: cookies,
      csrfToken: initialCsrfToken
    }

    console.log('Final auth tokens:', {
      relayCookie: getRelayCookie(cookies),
      csrfToken: initialCsrfToken
    })

    return true
  } catch (error) {
    console.error('Login failed:', error.message)
    if (error.response) {
      console.error('Error response:', error.response.data)
    }
    return false
  }
}

// Helper function to extract relay cookie
function getRelayCookie(cookies) {
  if (!cookies) return null;
  for (const cookie of cookies) {
    if (cookie.startsWith('relay=')) {
      return cookie.split(';')[0];  // Get just the relay=value part
    }
  }
  return null;
}

// Helper function to make authenticated Boomtown requests
async function makeBoomtownRequest(url) {
  const requestId = uuidv4()
  console.log('Making Boomtown request to:', url)
  console.log('Auth tokens:', authTokens)
  console.log('Instance ID:', instanceId)
  console.log('Request ID:', requestId)

  if (!authTokens.cookies) {
    throw new Error('No cookies found')
  }

  const headers = {
    'accept': 'application/json',
    // 'accept-language': 'en-US,en;q=0.9',
    // 'acting-as;': '',
    'cookie': getRelayCookie(authTokens.cookies),
    // 'cookie': authTokens.cookies.join('; '),
    // 'no-translate;': '',
    // 'platform-version': '2',
    // 'priority': 'u=1, i',
    // 'referer': 'https://app.stage.goboomtown.com/',
    // 'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
    // 'sec-ch-ua-mobile': '?0',
    // 'sec-ch-ua-platform': '"macOS"',
    // 'sec-fetch-dest': 'empty',
    // 'sec-fetch-mode': 'cors',
    // 'sec-fetch-site': 'same-origin',
    // 'time-zone': 'America/Los_Angeles',
    // 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'x-boomtown-client-instance-id': instanceId,
    'x-boomtown-csrf-token': authTokens.csrfToken,
    'x-request-id': requestId,
    // 'x-requested-with': 'XMLHttpRequest'
  }

  console.log('outoing Headers:', headers)
  
  try {
    const response = await axios({
      method: 'get',
      url: url,
      headers: headers
    })
    
    console.log('Response status:', response.status)
    console.log('Response data:', response.data)
    
    return response.data
  } catch (error) {
    console.error('Boomtown request failed:', error.message)
    console.error('Response status:', error.response?.status)
    console.error('Response data:', error.response?.data)
    throw error
  }
}

// Routes
app.get('/issue', async (req, res) => {
  console.log('GET /issue called')
  
  const issueId = req.query.issueId
  if (!issueId) {
    return res.status(400).json({ error: 'issueId parameter is required' })
  }

  try {
    // Ensure we're logged in before proceeding
    if (!authTokens.cookies || !authTokens.csrfToken) {
      const loginSuccess = await loginToBoomtown()
      if (!loginSuccess) {
        return res.status(500).json({ error: 'Failed to authenticate with Boomtown' })
      }
    }

    
    // Make the request to Boomtown's issue endpoint
    const issueUrl = `https://app.stage.goboomtown.com/api/issues/?sAction=listingCases&id=${issueId}`
    const issueData = await makeBoomtownRequest(issueUrl)
    console.log('Issue data:', issueData)
    
    res.json(issueData)
  } catch (error) {
    console.error('Error fetching issue:', error.message)
    res.status(500).json({ error: 'Failed to fetch issue details' })
  }
})

app.get('/comm', async (req, res) => {
  console.log('GET /comm called')
  
  // Ensure we're logged in before proceeding
  if (!authTokens.cookies || !authTokens.csrfToken) {
    const loginSuccess = await loginToBoomtown()
    if (!loginSuccess) {
      return res.status(500).json({ error: 'Failed to authenticate with Boomtown' })
    }
  }
  
  res.json({ message: 'Comm endpoint', auth: authTokens })
})

// Start server
const port = process.env.PORT || 3005
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
