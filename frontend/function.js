const API_URL = 'http://localhost:3000/api/movies';
const SEARCH_URL = 'http://localhost:3000/api/search';
const OMDB_DETAIL_URL = 'http://localhost:3000/api/omdb';
const FAVORITES_URL = 'http://localhost:3000/api/favorites';

let favoriteIds = new Set();
let accessToken = null;
let shownMovieIds = new Set();
let isLoadingMore = false;
let scrollObserver = null;

const requireAuth = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'landing.html';
        return null;
    }
    accessToken = session.access_token;
    return session.user;
};

const setupLogout = () => {
    document.querySelector('.logout-btn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = 'landing.html';
    });
};

const getMovies = async (excludeIds) => {
    const url = excludeIds && excludeIds.size > 0
        ? `${API_URL}?exclude=${encodeURIComponent([...excludeIds].join(','))}`
        : API_URL;
    const response = await fetch(url);
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
    const response = await fetch(FAVORITES_URL, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || 'Failed to load favorites');
    }
    return data;
};

const addFavorite = async (imdbID) => {
    const response = await fetch(FAVORITES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ imdbID })
    });
    if (!response.ok) {
        throw new Error('Failed to add favorite');
    }
};

const removeFavorite = async (imdbID) => {
    const response = await fetch(`${FAVORITES_URL}/${imdbID}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        throw new Error('Failed to remove favorite');
    }
};

const getDisplayName = (user) => user.user_metadata && user.user_metadata.full_name
    ? user.user_metadata.full_name
    : user.email;

const updateDisplayName = async (name) => {
    const { error } = await supabaseClient.auth.updateUser({ data: { full_name: name } });
    if (error) {
        throw new Error(error.message);
    }
};

const updatePassword = async (password) => {
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) {
        throw new Error(error.message);
    }
};

const showSettingsMessage = (el, message, isError) => {
    el.textContent = message;
    el.classList.remove('hidden', 'success', 'error');
    el.classList.add(isError ? 'error' : 'success');
};

const setupProfileSettings = (user) => {
    const nameForm = document.querySelector('.name-form');
    const passwordForm = document.querySelector('.password-form');
    if (!nameForm || !passwordForm) {
        return;
    }

    const currentName = user.user_metadata && user.user_metadata.full_name;
    document.querySelector('#display-name').value = currentName || '';

    nameForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const name = document.querySelector('#display-name').value.trim();
        const messageEl = nameForm.querySelector('.name-message');
        try {
            await updateDisplayName(name);
            document.querySelector('.user-email').textContent = name || user.email;
            showSettingsMessage(messageEl, 'Name saved.', false);
        } catch (err) {
            showSettingsMessage(messageEl, err.message, true);
        }
    });

    passwordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const newPassword = document.querySelector('#new-password').value;
        const confirmPassword = document.querySelector('#confirm-password').value;
        const messageEl = passwordForm.querySelector('.password-message');

        if (newPassword !== confirmPassword) {
            showSettingsMessage(messageEl, 'Passwords do not match.', true);
            return;
        }

        try {
            await updatePassword(newPassword);
            passwordForm.reset();
            showSettingsMessage(messageEl, 'Password updated.', false);
        } catch (err) {
            showSettingsMessage(messageEl, err.message, true);
        }
    });
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

const appendMovieCards = (movies) => {
    const movieList = document.querySelector('.movie-list');
    movies.forEach(movie => {
        movieList.appendChild(createMovieCard(movie));
    });
};

const renderMovieList = (movies) => {
    document.querySelector('.movie-list').innerHTML = '';
    appendMovieCards(movies);
};

const loadMoreMovies = async () => {
    if (isLoadingMore) {
        return;
    }
    isLoadingMore = true;
    document.querySelector('.loading-more').classList.remove('hidden');
    try {
        const movies = await getMovies(shownMovieIds);
        movies.forEach(movie => shownMovieIds.add(movie.imdbID));
        appendMovieCards(movies);
    } catch (err) {
        // skip this batch; the next scroll trigger will retry
    } finally {
        isLoadingMore = false;
        document.querySelector('.loading-more').classList.add('hidden');
    }
};

const setupInfiniteScroll = () => {
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            loadMoreMovies();
        }
    });
    scrollObserver.observe(document.querySelector('.scroll-sentinel'));
};

const displayMovies = async () => {
    shownMovieIds = new Set();
    const movies = await getMovies();
    movies.forEach(movie => shownMovieIds.add(movie.imdbID));
    renderMovieList(movies);
    setupInfiniteScroll();
};

const renderFavorites = (movies) => {
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
            if (scrollObserver) {
                scrollObserver.disconnect();
            }
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

const setupBackToTop = () => {
    const button = document.querySelector('.back-to-top');
    window.addEventListener('scroll', () => {
        button.classList.toggle('hidden', window.scrollY < 300);
    });
    button.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
};

const goToBrowse = () => {
    if (document.body.dataset.page === 'home') {
        document.querySelector('.search-input').value = '';
        if (scrollObserver) {
            scrollObserver.disconnect();
        }
        displayMovies();
    } else {
        window.location.href = 'index.html';
    }
};

const setupBrowseTriggers = () => {
    document.querySelectorAll('.browse-trigger').forEach(el => {
        el.addEventListener('click', goToBrowse);
    });
};

(async () => {
    const user = await requireAuth();
    if (!user) {
        return;
    }
    document.querySelector('.user-email').textContent = getDisplayName(user);
    setupLogout();
    setupModal();
    setupProfileSettings(user);
    setupBackToTop();
    setupBrowseTriggers();

    let favorites = [];
    try {
        favorites = await getFavorites();
        favoriteIds = new Set(favorites.map(movie => movie.imdbID));
    } catch (err) {
        // favorites may be unavailable (e.g. Supabase table not set up yet)
    }

    if (document.body.dataset.page === 'profile') {
        renderFavorites(favorites);
    } else {
        displayMovies();
        setupSearch();
    }
})();