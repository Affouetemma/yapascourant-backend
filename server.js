require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const app = express();
const PORT = config.PORT;

// Log startup configuration
console.log('Starting server with configuration:', {
  NODE_ENV: config.NODE_ENV,
  PORT: PORT,
  MONGODB_URI: config.MONGODB_URI ? '[SET]' : '[NOT SET]',
  CORS_ENABLED: true
});

// More permissive CORS configuration
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Enable pre-flight requests for all routes
app.options('*', cors());

app.use(express.json());

let client;
let db;

async function connectDB() {
  try {
    console.log('Attempting to connect to MongoDB...');
    client = new MongoClient(config.MONGODB_URI);
    await client.connect();
    db = client.db('ya-pas-courant');
    console.log('Connected to MongoDB successfully');
    
    // Verify collections exist
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log('Available collections:', collectionNames);
    
    if (!collectionNames.includes('scores')) {
      await db.createCollection('scores');
    }
    if (!collectionNames.includes('votes')) {
      await db.createCollection('votes');
    }
    if (!collectionNames.includes('comments')) {
      await db.createCollection('comments');
    }
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

// API Routes
app.get('/api', (req, res) => {
  res.json({
    message: 'Ya Pas Courant API',
    status: 'running',
    endpoints: {
      health: '/api/health',
      scores: '/api/scores',
      scoresByGame: '/api/scores/:game',
      votes: '/api/votes',
      comments: '/api/comments'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cors: {
      origin: req.headers.origin || 'not set',
      method: req.method,
      headers: req.headers['access-control-request-headers'] || 'not set'
    },
    db: db ? 'connected' : 'not connected',
    environment: process.env.NODE_ENV || 'not set'
  });
});

app.post('/api/scores', async (req, res) => {
  try {
    if (!db) throw new Error('Database not connected');
    const { name, location, game, score } = req.body;
    
    if (!name || !location || !game || !score) {
      return res.status(400).json({ error: 'Tous les champs sont requis pour enregistrer un score' });
    }

    const result = await db.collection('scores').insertOne({ 
      name, 
      location, 
      game, 
      score, 
      date: new Date() 
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error saving score:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/scores/:game', async (req, res) => {
  try {
    if (!db) throw new Error('Database not connected');
    const scores = await db.collection('scores')
      .aggregate([
        // Match only scores for the requested game
        { $match: { game: req.params.game } },
        
        // Add a field for exact name+location matching
        {
          $addFields: {
            playerKey: { 
              $concat: [
                { $trim: { input: "$name" } },
                "-",
                { $trim: { input: "$location" } }
              ]
            }
          }
        },
        
        // Sort by date (descending) to get most recent first
        { $sort: { date: -1 } },
        
        // Group by the exact player key
        {
          $group: {
            _id: "$playerKey",
            // Keep only the first (most recent) document
            doc: { $first: "$$ROOT" }
          }
        },
        
        // Restore the original document structure
        { $replaceRoot: { newRoot: "$doc" } },
        
        // Sort by score (highest first)
        { $sort: { score: -1 } }
      ])
      .toArray();
    
    res.json(scores);
  } catch (error) {
    console.error('Error fetching scores:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/scores', async (req, res) => {
  try {
    if (!db) {
      await connectDB();
    }
    const scores = await db.collection('scores').find().toArray();
    res.json(scores);
  } catch (error) {
    console.error('Error fetching scores:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/votes', async (req, res) => {
  try {
    if (!db) throw new Error('Database not connected');
    const { game } = req.body;
    
    if (!game) {
      return res.status(400).json({ error: 'Le jeu est requis pour voter' });
    }

    const result = await db.collection('votes').insertOne({ 
      game, 
      date: new Date() 
    });
    
    // Récupérer les votes mis à jour
    const votes = await db.collection('votes')
      .aggregate([
        { $group: { _id: '$game', count: { $sum: 1 } } }
      ])
      .toArray();

    const voteCounts = { delestage: 0, panne: 0, detective: 0 };
    votes.forEach(vote => { voteCounts[vote._id] = vote.count });

    res.json(voteCounts);
  } catch (error) {
    console.error('Error saving vote:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/votes', async (req, res) => {
  try {
    if (!db) {
      await connectDB();
    }
    const votes = await db.collection('votes')
      .aggregate([
        { $group: { _id: '$game', count: { $sum: 1 } } }
      ])
      .toArray();

    const voteCounts = { delestage: 0, panne: 0, detective: 0 };
    votes.forEach(vote => { voteCounts[vote._id] = vote.count });
    res.json(voteCounts);
  } catch (error) {
    console.error('Error fetching votes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/comments', async (req, res) => {
  try {
    if (!db) throw new Error('Database not connected');
    const { name, comment } = req.body;
    if (!name || !comment) return res.status(400).json({ error: 'Nom et commentaire requis.' });

    const result = await db.collection('comments').insertOne({ name, comment, timestamp: new Date() });
    res.status(201).json(result);
  } catch (error) {
    console.error('Erreur POST commentaire:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/comments', async (req, res) => {
  try {
    if (!db) {
      await connectDB();
    }
    const comments = await db.collection('comments')
      .find()
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();
    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/debug/scores', async (req, res) => {
  try {
    if (!db) throw new Error('Database not connected');
    const scores = await db.collection('scores')
      .find({})
      .sort({ date: -1 })
      .toArray();
    
    res.json(scores);
  } catch (error) {
    console.error('Error fetching raw scores:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/debug/reset-scores', async (req, res) => {
  try {
    if (!db) throw new Error('Database not connected');
    await db.collection('scores').deleteMany({});
    console.log('All scores have been reset');
    res.json({ message: 'All scores have been reset successfully' });
  } catch (error) {
    console.error('Error resetting scores:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve static files from the React app
const buildPath = path.join(__dirname, '../build');
app.use(express.static(buildPath));

// The "catchall" handler: for any request that doesn't
// match an API route, send back React's index.html file.
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(buildPath, 'index.html'));
  }
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: config.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();