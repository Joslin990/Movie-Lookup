require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

app.use(express.json())

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

const API_KEY = process.env.API_KEY;
const API_URL = "http://www.omdbapi.com/?apikey=" + API_KEY + "&";

let users = [];
let sessions = {};

const hashPassword = (password, salt) => {
    return crypto.scryptSync(password, salt, 64).toString('hex');
};

const createSession = (userId) => {
    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = userId;
    return token;
};

const getUserFromRequest = (req) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const userId = token && sessions[token];
    return users.find(u => u.id === userId) || null;
};

const requireUser = (req, res, next) => {
    const user = getUserFromRequest(req);
    if (!user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    req.user = user;
    next();
};

app.post('/api/auth/signup', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (users.find(u => u.email === email)) {
        return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
        id: users.length + 1,
        email,
        salt,
        passwordHash: hashPassword(password, salt),
        favorites: []
    };
    users.push(user);

    const token = createSession(user.id);
    res.status(201).json({ token, email: user.email });
});

app.post('/api/auth/signin', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = users.find(u => u.email === email);
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const suppliedHash = Buffer.from(hashPassword(password, user.salt), 'hex');
    const storedHash = Buffer.from(user.passwordHash, 'hex');
    if (!crypto.timingSafeEqual(suppliedHash, storedHash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createSession(user.id);
    res.json({ token, email: user.email });
});

app.get('/api/auth/me', (req, res) => {
    const user = getUserFromRequest(req);
    if (!user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({ email: user.email, favorites: user.favorites });
});

app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
        delete sessions[token];
    }
    res.status(204).end();
});

const CURATED_IMDB_IDS = [
    'tt1375666', // Inception
    'tt0468569', // The Dark Knight
    'tt0816692', // Interstellar
    'tt0110912', // Pulp Fiction
    'tt0133093', // The Matrix
    'tt0137523', // Fight Club
    'tt0109830', // Forrest Gump
    'tt0111161', // The Shawshank Redemption
    'tt0068646', // The Godfather
    'tt6751668', // Parasite
    'tt2582802', // Whiplash
    'tt0114369', // Se7en
    'tt0099685', // Goodfellas
    'tt0482571', // The Prestige
    'tt0172495', // Gladiator
    'tt0110357', // The Lion King
    'tt0120338', // Titanic
    'tt0499549', // Avatar
    'tt7286456', // Joker
    'tt0407887'  // The Departed
];

const getRandomSample = (arr, count) => {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
};

app.get('/api/movies', async (req, res) => {
    const sampleIds = getRandomSample(CURATED_IMDB_IDS, 10);
    try {
        const results = await Promise.all(sampleIds.map(async (imdbID) => {
            const omdbResponse = await fetch(`${API_URL}i=${imdbID}`);
            return omdbResponse.json();
        }));
        res.json(results.filter(movie => movie.Response !== 'False'));
    } catch (err) {
        res.status(502).json({ error: 'Failed to reach OMDb API' });
    }
});

app.get('/api/favorites', requireUser, async (req, res) => {
    try {
        const results = await Promise.all(req.user.favorites.map(async (imdbID) => {
            const omdbResponse = await fetch(`${API_URL}i=${encodeURIComponent(imdbID)}&plot=full`);
            return omdbResponse.json();
        }));
        res.json(results.filter(movie => movie.Response !== 'False'));
    } catch (err) {
        res.status(502).json({ error: 'Failed to reach OMDb API' });
    }
});

app.post('/api/favorites', requireUser, (req, res) => {
    const { imdbID } = req.body;
    if (!imdbID) {
        return res.status(400).json({ error: 'imdbID is required' });
    }
    if (!req.user.favorites.includes(imdbID)) {
        req.user.favorites.push(imdbID);
    }
    res.status(201).json({ favorites: req.user.favorites });
});

app.delete('/api/favorites/:imdbID', requireUser, (req, res) => {
    req.user.favorites = req.user.favorites.filter(id => id !== req.params.imdbID);
    res.json({ favorites: req.user.favorites });
});

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }
    try {
        const omdbResponse = await fetch(`${API_URL}s=${encodeURIComponent(query)}`);
        const data = await omdbResponse.json();
        if (data.Response === 'False') {
            return res.status(404).json({ error: data.Error });
        }
        res.json(data.Search);
    } catch (err) {
        res.status(502).json({ error: 'Failed to reach OMDb API' });
    }
});

app.get('/api/omdb/:imdbID', async (req, res) => {
    const { imdbID } = req.params;
    try {
        const omdbResponse = await fetch(`${API_URL}i=${encodeURIComponent(imdbID)}&plot=full`);
        const data = await omdbResponse.json();
        if (data.Response === 'False') {
            return res.status(404).json({ error: data.Error });
        }
        res.json(data);
    } catch (err) {
        res.status(502).json({ error: 'Failed to reach OMDb API' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

