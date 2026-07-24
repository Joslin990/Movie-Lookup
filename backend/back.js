require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
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

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const requireUser = async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    req.user = data.user;
    next();
};

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
    'tt0407887', // The Departed
    'tt0071562', // The Godfather Part II
    'tt0108052', // Schindler's List
    'tt0167260', // The Lord of the Rings: The Return of the King
    'tt0167261', // The Lord of the Rings: The Two Towers
    'tt0120737', // The Lord of the Rings: The Fellowship of the Ring
    'tt0080684', // Star Wars: Episode V - The Empire Strikes Back
    'tt0076759', // Star Wars: Episode IV - A New Hope
    'tt0086190', // Star Wars: Episode VI - Return of the Jedi
    'tt0088763', // Back to the Future
    'tt0102926', // The Silence of the Lambs
    'tt0114814', // The Usual Suspects
    'tt0118799', // Life Is Beautiful
    'tt0361748', // Inglourious Basterds
    'tt0993846', // The Wolf of Wall Street
    'tt0910970', // WALL-E
    'tt1049413', // Up
    'tt0435761', // Toy Story 3
    'tt0088247', // The Terminator
    'tt0103064', // Terminator 2: Judgment Day
    'tt0117951', // Trainspotting
    'tt0209144', // Memento
    'tt0338013', // Eternal Sunshine of the Spotless Mind
    'tt0245429', // Spirited Away
    'tt0086250', // Scarface
    'tt0075314', // Taxi Driver
    'tt0078788', // Apocalypse Now
    'tt0034583', // Casablanca
    'tt0050083', // 12 Angry Men
    'tt0057012', // Dr. Strangelove
    'tt0119488', // L.A. Confidential
    'tt0120815', // Saving Private Ryan
    'tt0126029', // Shrek
    'tt0119217', // Good Will Hunting
    'tt0268978', // A Beautiful Mind
    'tt0180093', // Requiem for a Dream
    'tt0169547', // American Beauty
    'tt0105236', // Reservoir Dogs
    'tt4633694', // Spider-Man: Into the Spider-Verse
    'tt0113277', // Heat
    'tt0107290', // Jurassic Park
    'tt0116629', // Independence Day
    'tt1345836', // The Dark Knight Rises
    'tt0372784', // Batman Begins
    'tt1877830', // The Batman
    'tt4154756', // Avengers: Infinity War
    'tt4154796', // Avengers: Endgame
    'tt0848228', // The Avengers
    'tt2015381', // Guardians of the Galaxy
    'tt1130884'  // Shutter Island
];

const getRandomSample = (arr, count) => {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
};

app.get('/api/movies', async (req, res) => {
    const excludeIds = new Set((req.query.exclude || '').split(',').filter(Boolean));
    const pool = CURATED_IMDB_IDS.filter(id => !excludeIds.has(id));
    const sourceList = pool.length > 0 ? pool : CURATED_IMDB_IDS;
    const sampleIds = getRandomSample(sourceList, Math.min(10, sourceList.length));
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
    const { data: rows, error: dbError } = await supabase
        .from('favorites')
        .select('imdb_id')
        .eq('user_id', req.user.id);

    if (dbError) {
        return res.status(500).json({ error: 'Failed to load favorites' });
    }

    try {
        const results = await Promise.all(rows.map(async ({ imdb_id }) => {
            const omdbResponse = await fetch(`${API_URL}i=${encodeURIComponent(imdb_id)}&plot=full`);
            return omdbResponse.json();
        }));
        res.json(results.filter(movie => movie.Response !== 'False'));
    } catch (err) {
        res.status(502).json({ error: 'Failed to reach OMDb API' });
    }
});

app.post('/api/favorites', requireUser, async (req, res) => {
    const { imdbID } = req.body;
    if (!imdbID) {
        return res.status(400).json({ error: 'imdbID is required' });
    }

    const { error: dbError } = await supabase
        .from('favorites')
        .upsert({ user_id: req.user.id, imdb_id: imdbID });

    if (dbError) {
        return res.status(500).json({ error: 'Failed to save favorite' });
    }
    res.status(201).json({ imdbID });
});

app.delete('/api/favorites/:imdbID', requireUser, async (req, res) => {
    const { error: dbError } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', req.user.id)
        .eq('imdb_id', req.params.imdbID);

    if (dbError) {
        return res.status(500).json({ error: 'Failed to remove favorite' });
    }
    res.status(204).end();
});

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }
    try {
        const firstResponse = await fetch(`${API_URL}s=${encodeURIComponent(query)}`);
        const firstData = await firstResponse.json();
        if (firstData.Response === 'False') {
            return res.status(404).json({ error: firstData.Error });
        }

        // OMDb returns 10 results per page and only allows fetching up to 10 pages (100 results) total.
        const totalPages = Math.min(Math.ceil(parseInt(firstData.totalResults, 10) / 10) || 1, 10);
        let allResults = firstData.Search;

        if (totalPages > 1) {
            const remainingPages = await Promise.all(
                Array.from({ length: totalPages - 1 }, (_, i) => i + 2).map(async (page) => {
                    const pageResponse = await fetch(`${API_URL}s=${encodeURIComponent(query)}&page=${page}`);
                    return pageResponse.json();
                })
            );
            remainingPages.forEach(pageData => {
                if (pageData.Response !== 'False' && pageData.Search) {
                    allResults = allResults.concat(pageData.Search);
                }
            });
        }

        res.json(allResults);
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

