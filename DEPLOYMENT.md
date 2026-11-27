# Deployment

This guide deploys the app as one same-origin web service on Render, with
PostgreSQL hosted by Neon. FastAPI serves both `/api` and the built React app.
The browser therefore uses relative `/api` paths and needs no separate backend
URL or permissive CORS configuration.

## Before you start

- Push the repository to GitHub.
- Create a [Neon](https://neon.tech/) project.
- Obtain a Gemini API key for server-side use.
- Create a [Render](https://render.com/) account.

Do not commit `.env`, database credentials, or API keys. Add production secrets
only in Render's environment settings.

## Recommended: deploy from the Blueprint

1. In Neon, open **Connect**, select your database and role, and copy the
   **pooled** connection string. Keep it private.
2. In Render, choose **New → Blueprint**, connect this GitHub repository, and
   leave the root directory at the repository root. Render reads
   [`render.yaml`](./render.yaml) for the build, start, health-check, and
   runtime settings.
3. When prompted, provide:
   - `DATABASE_URL`: the Neon pooled connection string.
   - `GEMINI_API_KEY`: your server-side Gemini API key.

   The Blueprint generates `APP_SECRET_KEY` and sets `PYTHON_VERSION`,
   `UV_VERSION`, `ENVIRONMENT`, and `GEMINI_LIVE_MODEL`.

4. Deploy the service. The build creates the frontend bundle. On startup,
   Render applies Alembic migrations (including the shared rate-limit table)
   and launches FastAPI.
5. Open `https://<your-service>.onrender.com/api/health`, then open
   `https://<your-service>.onrender.com` to use the app.

## Configure an existing Render Web Service manually

If you created a Web Service instead of a Blueprint, it does not automatically
use the commands in `render.yaml`. In **Settings → Build & Deploy**, set:

- **Root Directory:** leave blank.
- **Build Command:**

  ```bash
  pip install uv==0.13.7 && uv sync --project backend --locked --no-dev && npm ci --prefix frontend && npm run build --prefix frontend
  ```

- **Start Command:**

  ```bash
  cd backend && uv run --no-sync alembic upgrade head && uv run --no-sync fastapi run app/main.py --host 0.0.0.0 --port $PORT
  ```

- **Health Check Path:** `/api/health`.

In **Environment**, set:

| Variable            | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| `PYTHON_VERSION`    | `3.12.13`                                                  |
| `UV_VERSION`        | `0.13.7`                                                   |
| `ENVIRONMENT`       | `production`                                               |
| `APP_SECRET_KEY`    | Generate a private random value of at least 32 characters. |
| `DATABASE_URL`      | Neon pooled PostgreSQL connection string.                  |
| `GEMINI_API_KEY`    | Gemini API key; keep it server-side.                       |
| `GEMINI_LIVE_MODEL` | `gemini-3.5-transcribe-live`                               |

Save the settings and deploy the latest commit. Confirm the build log reports
Python 3.12.13.

## Neon connection details

Use the pooled Neon URL (its hostname contains `-pooler.`). The backend
normalizes Neon's `postgresql://` URL for SQLAlchemy's asyncpg driver, enables
SSL, and removes `channel_binding`, which asyncpg does not accept as a
connection option. For pooled connections, the backend disables both
SQLAlchemy's prepared-statement cache and asyncpg's statement cache using the
correct driver option types.

Alembic migrations run on service startup before FastAPI starts. The deployed
frontend and API share an origin, so there is no frontend API URL to configure.
The hourly quota is stored in Neon, so it survives restarts and is shared by
service instances. It counts token requests and transcript create, edit, and
delete requests; reads and health checks do not consume quota. IP addresses are
stored as keyed hashes, not in plaintext. Behind Render's reverse proxy, the
limiter uses the rightmost address in `X-Forwarded-For`; do not expose the
FastAPI process directly to untrusted clients.

## Verify the deployment

1. Visit `/api/health`; it should return a successful health response.
2. Open the root URL and confirm the React app loads.
3. Allow microphone access and record a short sentence.
4. Stop the recording; confirm the transcript saves and appears in history.
5. Refresh the page and confirm the record remains available in the same
   browser.

Microphone access requires HTTPS, which Render provides for its service URL.

## Troubleshooting

- **`requirements.txt` not found:** Render is using its generic Python build
  command. Replace it with the build command above or deploy through the
  Blueprint.
- **`No interpreter found for Python 3.12`:** set `PYTHON_VERSION` to
  `3.12.13` in Render's environment settings and redeploy. A local `.env` does
  not configure Render.
- **`TypeError` comparing `str` and `int` while connecting to Neon:** deploy
  the latest repository changes. The pooled `statement_cache_size` must be
  passed to asyncpg as an integer, not as a URL query string.
- **Database connection or migration failure:** verify `DATABASE_URL` is the
  correct Neon pooled URL, and that it was copied without extra quotes or
  whitespace. Never paste the credential-bearing URL into public logs or chat.
- **Frontend does not load:** confirm the root directory is blank and the build
  command includes both `npm ci` and `npm run build`.

## Free-service limitations

Render's free web service can spin down after inactivity, delaying the first
request while it wakes. Its filesystem is ephemeral; persistent application
data belongs in Neon, not local files. Check current Render and Neon plan
limits in their dashboards. This setup is intended for an assignment demo,
not a production availability guarantee.
