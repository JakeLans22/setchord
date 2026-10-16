# Latreia

Latreia is a responsive song-chart library and worship-set planner. Its name comes from the Greek *latreia* (λατρεία), meaning worship and devoted service. The interface uses a calm blue, white, charcoal, and grey palette to keep the focus on songs for worship. Its multi-page frontend is rendered by React and built with Vite; it uses Supabase Auth/PostgreSQL with Row Level Security and a Vercel serverless function for URL-based chart import.

## Project structure

```text
index.html                 React-rendered authenticated dashboard
login.html / register.html Supabase sign-in and account creation
songs.html                 Search, view, edit, and delete songs
add-song.html              Import preview and manual song editor
edit-song.html             Edit an existing song
song.html                  Performance chart and transposition
sets.html                  Worship set library
create-set.html            Create or edit a worship set
set.html                   View, edit, and reorder a set's songs
src/main.jsx                React entry point for all pages
vite.config.js              Multi-page Vite build configuration
vercel.json                 Vercel build and output settings
css/style.css               Responsive dark theme
js/supabase.js              Public Supabase client configuration
js/app.js                   Auth, data operations, chart preview, and page behavior
api/import-song.js         Vercel URL importer (Cheerio)
supabase/schema.sql        Complete database schema, trigger, indexes, and RLS
```

## Requirements

- Node.js 22 or newer
- A Supabase project
- A Vercel account for production hosting and the import endpoint

## Configure Supabase

1. Create a project at [supabase.com](https://supabase.com/).
2. In **Project Settings → API**, copy the Project URL and public publishable key (the legacy anon key also works).
3. The configured project URL and public publishable key are in `js/supabase.js`. These values are intended to be public; never put a `service_role` key or database password in browser code.
4. Open the Supabase SQL editor and run all of [`supabase/schema.sql`](supabase/schema.sql). It creates or upgrades profiles, songs, worship sets, set/song relationships, indexes, the new-user profile trigger, and RLS policies. It does not drop existing tables or data. Existing songs and sets must already have their correct `user_id`; the script stops with a clear error rather than guessing ownership if rows are unassigned.
5. In **Authentication → URL Configuration**, set the Site URL to `https://setchord.vercel.app`. Add `https://setchord.vercel.app/**` to Redirect URLs. If testing locally, keep `http://localhost:3000/**` as an additional redirect URL; do not use localhost as the production Site URL.
6. Configure your desired email-confirmation and password policies in **Authentication → Providers → Email**.

The profile trigger creates the `profiles` record on registration, using the display name provided at sign-up. All persistent user content lives in PostgreSQL. The browser persists only the Supabase authentication session and transient view state; the application does not keep songs or sets in localStorage.

### Public client configuration and environment variables

Set the **public** project URL and publishable/anon key in `js/supabase.js`, then commit that client configuration with the site. A Supabase publishable/anon key is designed to be visible in a browser; RLS is the security boundary. Do not put `SUPABASE_SERVICE_ROLE_KEY`, a database password, or another secret in `js/supabase.js`, HTML, or a public client-side environment variable.

## Install and run locally

```powershell
npm install
npm run dev
```

Vite serves the React frontend locally. To test the URL-import serverless function as well, use Vercel's local development server:

```powershell
npx vercel dev
```

Use the local URL printed by Vite (usually `http://localhost:5173`) for frontend development. The Vercel development URL (usually `http://localhost:3000`) also serves `/api/import-song`. Browser authentication redirect URLs must be configured in Supabase for the local URL you use.

## Authentication and privacy

- Sign-up, email/password sign-in, password recovery, and sign-out use Supabase Auth.
- Authenticated pages redirect visitors without a session to `login.html`.
- User ownership is checked by PostgreSQL policies against `auth.uid()`, not by trusting a frontend-supplied owner ID.
- The frontend uses only the Supabase public publishable/anon key.
- The SQL cascading foreign keys remove set-song relationships when a song or set is deleted; deleting a set never deletes its songs.

## Song library

Use **Add a song** to either enter chart information manually or import a public song page. The importer checks embedded structured chart data (including Ultimate Guitar's page data), chart-specific HTML, and common chart containers; it normalizes chord markup to Latreia's `[G]lyrics` format and can detect unbracketed chord runs. A chart must be extracted before the importer offers the draft for review. Both paths show an editable form and live formatted chart preview. The importer only returns draft data. It never writes to Supabase. The final, edited title, artist, key, chart, and source URL are inserted only after **Save song** is pressed.

Songs may be searched by title or artist, filtered by English or Tagalog, and browsed ten at a time. Language is selected when adding or editing a song; existing songs default to English unless changed. Songs may also be viewed in a performance layout, edited without creating a duplicate, or deleted. The original key remains unchanged while the performance viewer transposes the displayed chart in semitone increments. Chord quality and slash-bass notes are preserved. Charts with recognized section headings show a sticky, collapsible section navigator in performance mode, with smooth jumps and a highlight for the section currently in view. Section labels use distinct, theme-aware colors to make the chart easier to scan.

External chart sites can block automated requests, require sign-in, or render their chart only in browser JavaScript. Those pages may not be importable. Import is bounded by a timeout and response-size limit and rejects local/private network addresses.

Run the import parsing smoke tests with `npm run test:import`.

## Worship sets

Create a named set, choose an optional service date, add a description, schedule musicians for each position, open it, and add songs from your library. Assign a performance key per song in the set; opening that song from the set applies the saved key without changing the song's library key. Each song can be opened in performance mode, removed from the set without deleting the library song, or moved up/down. The dashboard's most-played count reflects each song's current placement in a worship set; it reuses `set_songs` rather than recording a separate play history. Set deletion asks for confirmation and leaves songs intact.

For an existing Supabase project, add the per-set key column in the SQL Editor before using key assignments:

```sql
alter table public.set_songs add column if not exists performance_key text;
alter table public.worship_sets add column if not exists service_date date;
```

Run the latest [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor to add the song language column, worship-set service dates, and the per-set musician schedule table and policies. Existing songs default to English, and existing sets have no service date until one is assigned. The script is safe to rerun and preserves existing songs, sets, and song placements.

## Deploy with GitHub and Vercel

1. Add the project to a GitHub repository. `node_modules`, `.env` files, and Vercel local files are ignored.
2. In Vercel, import the GitHub repository. `vercel.json` configures the Vite build output in `dist`; Vercel also discovers `api/import-song.js` as a serverless function.
3. Keep the Supabase Project URL and public publishable/anon key in `js/supabase.js`; both are public client configuration, protected by RLS. Do not add a service-role key to Vercel frontend environment variables or commit one to Git.
4. Deploy, then add the deployment URL to Supabase's Site URL and Redirect URLs.
5. Smoke-test registration, confirmation (if enabled), password recovery, song create/edit/delete, set create/order/delete, and import preview before saving a song.

The project requires Node.js 22 or newer and the dependencies listed in `package.json`. Vercel installs them during deployment. The importer accepts POST requests at `/api/import-song`; importing does not require an authenticated session because it does not persist data.

## Database relationships

- `profiles.id` references `auth.users.id`.
- `songs.user_id` references `profiles.id`.
- `worship_sets.user_id` references `profiles.id`.
- `set_songs.set_id` references `worship_sets.id`.
- `set_songs.song_id` references `songs.id`.
- `set_songs.position` defines the display order of songs inside a set.

All four public tables have RLS enabled. Profile, song, and set policies scope rows to the active user. Relationship policies additionally verify that both the set and the song belong to the active user.
