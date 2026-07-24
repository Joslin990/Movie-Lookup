# Movie Lookup

A IMDB-style movie browsing app. Browse a random, infinite-scrolling
catalog of movies, search the full OMDb database, view synopsis/cast
details, and save favorites to your account. Built with a plain
Node/Express backend and a vanilla HTML/CSS/JS frontend (no build step,
no framework) with Supabase handling authentication and favorites
storage.

Designed to be simple and easy to use — a good fit for seniors or
anyone who just wants a straightforward website to look up movies,
without a cluttered interface or unnecessary complexity.

## Features

- Email/password sign up and sign in (Supabase Auth)
- Landing page with hero, feature sections, and FAQ
- Infinite-scroll browse of random movies pulled from OMDb
- Search across the full OMDb result set (not just the first page)
- Click a title to see its full synopsis and cast in a modal
- Favorite/unfavorite movies via a heart icon, synced to your account
- Profile page: edit display name, change password, view your favorites
- Dark, Netflix-inspired UI

## Tech stack

- **Backend:** Node.js, Express
- **Frontend:** Static HTML/CSS/JS (no bundler), served via any static
  file server (e.g. VS Code Live Server)
- **Movie data:** [OMDb API](https://www.omdbapi.com/)
- **Auth & database:** [Supabase](https://supabase.com/) (Auth +
  Postgres for favorites)

## Project structure

```
backend/
  back.js            Express server and all API routes
  .env               API keys (not committed)
frontend/
  landing.html/.css/.js   Public landing page + sign up/sign in modal
  index.html              Browse/search page (requires auth)
  profile.html             Account settings + favorites (requires auth)
  function.js              Shared logic for index.html and profile.html
  style.css                 Shared styles for index.html and profile.html
  supabase-config.js       Supabase client config (project URL + anon key)
```

## Setup

### 1. Install dependencies

```
npm install
```

### 2. Get an OMDb API key

Sign up for a free key at [omdbapi.com](https://www.omdbapi.com/apikey.aspx).

### 3. Create a Supabase project

Create a free project at [supabase.com](https://supabase.com/). From
**Project Settings → API**, collect:

- Project URL
- `anon` / `publishable` key (safe for frontend use)
- `service_role` / `secret` key (backend only — never expose this)

### 4. Create the favorites table

In the Supabase SQL Editor, run:

```sql
create table favorites (
  user_id uuid references auth.users(id) on delete cascade,
  imdb_id text not null,
  created_at timestamptz default now(),
  primary key (user_id, imdb_id)
);

alter table favorites enable row level security;

create policy "Users can view their own favorites" on favorites
  for select using (auth.uid() = user_id);
create policy "Users can insert their own favorites" on favorites
  for insert with check (auth.uid() = user_id);
create policy "Users can delete their own favorites" on favorites
  for delete using (auth.uid() = user_id);
```

### 5. Configure environment variables

Create `backend/.env`:

```
API_KEY=<your OMDb API key>
SUPABASE_URL=<your Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<your Supabase service_role key>
```

Edit `frontend/supabase-config.js` and replace the placeholders with
your project URL and **anon/publishable** key (not the service role
key):

```js
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

Optional: in Supabase → **Authentication → Providers → Email**, you can
disable "Confirm email" for faster local testing (new signups get a
session immediately instead of waiting on a confirmation link).

### 6. Run it

Start the backend:

```
node backend/back.js
```

This serves the API at `http://localhost:3000`. Then open
`frontend/landing.html` with a static file server (e.g. the VS Code
Live Server extension) and sign up.

## API endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/api/movies` | Random batch of movies (`?exclude=id1,id2` to skip already-seen ones) |
| GET | `/api/search?q=` | All OMDb search results matching a query |
| GET | `/api/omdb/:imdbID` | Full details (plot, cast, poster) for one movie |
| GET | `/api/favorites` | Current user's favorited movies (auth required) |
| POST | `/api/favorites` | Add a favorite, body `{ imdbID }` (auth required) |
| DELETE | `/api/favorites/:imdbID` | Remove a favorite (auth required) |

Authenticated routes expect `Authorization: Bearer <supabase access token>`.

## Notes

- Favorites are stored per Supabase user in the `favorites` table;
  everything else (movie data) is fetched live from OMDb on each
  request, nothing is cached or persisted locally.
- The random browse pool draws from a curated list of ~70 well-known
  titles; infinite scroll cycles through them without repeats until
  the pool is exhausted, then wraps around.
