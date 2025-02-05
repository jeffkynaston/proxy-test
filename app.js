const express = require('express')
const cors = require('cors')

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

// Routes
app.get('/issue', (req, res) => {
  console.log('GET /issue called')
  res.json({ message: 'Issue endpoint' })
})

app.get('/comm', (req, res) => {
  console.log('GET /comm called')
  res.json({ message: 'Comm endpoint' })
})

// Start server
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
