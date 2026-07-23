const API_URL = 'http://localhost:3000/api/movies';
const SEARCH_URL = 'http://localhost:3000/api/search';
const OMDB_DETAIL_URL = 'http://localhost:3000/api/omdb';
const AUTH_URL = 'http://localhost:3000/api/auth';
const FAVORITES_URL = 'http://localhost:3000/api/favorites';

let favoriteIds = new Set();

const requireAuth = async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = 'landing.html';
        return null;
    }
    try {
        const response = await fetch(`${AUTH_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            throw new Error('Invalid session');
        }
        return await response.json();
    } catch (err) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authEmail');
        window.location.href = 'landing.html';
        return null;
    }
};

const setupLogout = () => {
    document.querySelector('.logout-btn').addEventListener('click', async () => {
        const token = localStorage.getItem('authToken');
        try {
            await fetch(`${AUTH_URL}/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (err) {
            // logout locally even if the request fails
        }
        localStorage.removeItem('authToken');
        localStorage.removeItem('authEmail');
        window.location.href = 'landing.html';
    });
};

const getMovies = async () => {
    const response = await fetch(API_URL);
    const movies = await response.json();
    return movies;
};

const searchMovies = async (query) => {
    const response = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Search failed');
    }
    return data;
};

const getMovieDetails = async (imdbID) => {
    const response = await fetch(`${OMDB_DETAIL_URL}/${imdbID}`);
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch movie details');
    }
    return data;
};

const getFavorites = async () => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(FAVORITES_URL, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Failed to load favorites');
    }
    return data;
};

const addFavorite = async (imdbID) => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(FAVORITES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ imdbID })
    });
    if (!response.ok) {
        throw new Error('Failed to add favorite');
    }
};

const removeFavorite = async (imdbID) => {
    const token = localStorage.getItem('authToken');
    const response = await fetch(`${FAVORITES_URL}/${imdbID}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) {
        throw new Error('Failed to remove favorite');
    }
};

const showMovieModal = (details) => {
    const modal = document.querySelector('.movie-modal');
    modal.querySelector('.modal-title').textContent = `${details.Title} (${details.Year})`;
    modal.querySelector('.modal-plot').textContent = details.Plot;
    modal.querySelector('.modal-cast span').textContent = details.Actors;
    modal.classList.remove('hidden');
};

const hideMovieModal = () => {
    document.querySelector('.movie-modal').classList.add('hidden');
};

const createMovieCard = (movie) => {
    const movieItem = document.createElement('li');
    const posterWrap = document.createElement('div');
    posterWrap.className = 'poster-wrap';

    if (movie.Poster && movie.Poster !== 'N/A') {
        const poster = document.createElement('img');
        poster.src = movie.Poster;
        poster.alt = `${movie.Title} poster`;
        posterWrap.appendChild(poster);
    }

    const heartBtn = document.createElement('button');
    heartBtn.type = 'button';
    heartBtn.className = 'favorite-btn';
    const updateHeart = () => {
        const isFavorited = favoriteIds.has(movie.imdbID);
        heartBtn.textContent = isFavorited ? '♥' : '♡';
        heartBtn.classList.toggle('favorited', isFavorited);
        heartBtn.setAttribute('aria-label', isFavorited ? 'Remove from favorites' : 'Add to favorites');
    };
    updateHeart();
    heartBtn.addEventListener('click', async () => {
        try {
            if (favoriteIds.has(movie.imdbID)) {
                await removeFavorite(movie.imdbID);
                favoriteIds.delete(movie.imdbID);
                if (document.body.dataset.page === 'profile') {
                    movieItem.remove();
                    return;
                }
            } else {
                await addFavorite(movie.imdbID);
                favoriteIds.add(movie.imdbID);
            }
            updateHeart();
        } catch (err) {
            // leave heart state unchanged if the request fails
        }
    });
    posterWrap.appendChild(heartBtn);
    movieItem.appendChild(posterWrap);

    const caption = document.createElement('button');
    caption.type = 'button';
    caption.className = 'movie-title-btn';
    caption.textContent = `${movie.Title} (${movie.Year})`;
    caption.addEventListener('click', async () => {
        if (movie.Plot) {
            showMovieModal(movie);
            return;
        }
        try {
            const details = await getMovieDetails(movie.imdbID);
            showMovieModal(details);
        } catch (err) {
            showMovieModal({ Title: movie.Title, Year: movie.Year, Plot: err.message, Actors: '' });
        }
    });
    movieItem.appendChild(caption);

    return movieItem;
};

const renderMovieList = (movies) => {
    const movieList = document.querySelector('.movie-list');
    movieList.innerHTML = '';
    movies.forEach(movie => {
        movieList.appendChild(createMovieCard(movie));
    });
};

const displayMovies = async () => {
    const movies = await getMovies();
    renderMovieList(movies);
};

const displayFavorites = async () => {
    const movies = await getFavorites();
    const movieList = document.querySelector('.movie-list');
    if (movies.length === 0) {
        movieList.innerHTML = '';
        const emptyItem = document.createElement('li');
        emptyItem.className = 'empty-message';
        emptyItem.textContent = "You haven't favorited any movies yet.";
        movieList.appendChild(emptyItem);
        return;
    }
    renderMovieList(movies);
};

const setupSearch = () => {
    const searchForm = document.querySelector('.search-form');
    searchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const query = document.querySelector('.search-input').value.trim();
        if (!query) {
            return;
        }
        try {
            const results = await searchMovies(query);
            renderMovieList(results);
        } catch (err) {
            const movieList = document.querySelector('.movie-list');
            movieList.innerHTML = '';
            const errorItem = document.createElement('li');
            errorItem.textContent = err.message;
            movieList.appendChild(errorItem);
        }
    });
};

const setupModal = () => {
    document.querySelector('.close-modal').addEventListener('click', hideMovieModal);
    document.querySelector('.movie-modal').addEventListener('click', (event) => {
        if (event.target.classList.contains('movie-modal')) {
            hideMovieModal();
        }
    });
};

(async () => {
    const user = await requireAuth();
    if (!user) {
        return;
    }
    document.querySelector('.user-email').textContent = user.email;
    favoriteIds = new Set(user.favorites || []);
    setupLogout();
    setupModal();

    if (document.body.dataset.page === 'profile') {
        displayFavorites();
    } else {
        displayMovies();
        setupSearch();
    }
})();