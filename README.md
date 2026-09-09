# InstaFetch

InstaFetch is a public Instagram media downloader for content that Instagram exposes without authentication. It never collects Instagram credentials, browser cookies, or private-account access.

The repository is an npm-workspaces monorepo:

- `apps/web`: React, Vite, TypeScript, Tailwind CSS, and React Router frontend.
- `apps/api`: Express and TypeScript API with yt-dlp/gallery-dl extraction, bounded temporary media storage, and signed media tokens.
- `packages/shared`: shared URL validation and media types.

## Local development

Requirements:

- Node.js 22 or newer
- npm 10 or newer
- yt-dlp, ffmpeg, and ffprobe on `PATH` for live extraction checks

Install and verify the deterministic checks:

```text
npm ci
npm run lint
npm run test
npm run build
npm run e2e
```

Run the development applications separately:

```text
npm run dev:api
npm run dev:web
```

Copy `.env.example` to `.env` for local settings. Never put credentials, cookies, or production secrets in the repository.

The API listens on `0.0.0.0` and port `3001` locally. The web client uses `VITE_API_BASE_URL` and defaults to `http://localhost:3001`.

## Environment variables

Backend variables (the root `.env.example` is the template):

- `DOWNLOAD_TOKEN_SECRET`: required in production; use a unique random value of at least 32 characters.
- `WEB_ORIGIN`: one or more comma-separated exact `http://` or `https://` browser origins. Production does not allow wildcard CORS.
- `PORT`: supplied by Render in production; `3001` is the local default.
- `NODE_ENV`: set to `production` on Render.
- `YTDLP_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH`, and `GALLERY_DL_PATH`: optional local executable overrides. Container deployments resolve all four tools from `PATH`.

Generate a secret locally without storing it in Git:

```text
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Frontend variable:

- `VITE_API_BASE_URL`: the API origin used at build time, such as the Render service URL.

## Deploy the API to Render

`render.yaml` defines a free-compatible Docker Web Service named `instafetch-api` with `/health/live` as its health check. To create it from the repository, use Render's Blueprint flow or configure the same values manually:

1. Select this private GitHub repository and the `main` branch.
2. Choose **Docker** with repository root as the Docker context and `./Dockerfile` as the Dockerfile.
3. Choose the **Free** plan and leave database and persistent-disk settings empty.
4. Set `NODE_ENV=production`.
5. Set `WEB_ORIGIN` to the exact Cloudflare Pages origin, without a path.
6. Set `DOWNLOAD_TOKEN_SECRET` to a newly generated random value. Do not paste it into Git or `render.yaml`.
7. Use `/health/live` for the health check. Render supplies `PORT`; do not override it.

The API image installs Node.js 22, yt-dlp, gallery-dl, ffmpeg, and ffprobe. It runs only the compiled API server as a non-root user. Temporary media is kept under the instance's ephemeral filesystem and removed after the short resolution/media TTL; no permanent user files are expected, so no persistent disk is required.

## Deploy the web app to Cloudflare Pages

Create a Pages project from the same repository and `main` branch with these settings:

- **Root directory:** repository root (`/`).
- **Build command:** `npm --workspace @instafetch/shared run build && npm --workspace @instafetch/web run build`.
- **Build output directory:** `apps/web/dist`.
- **Node.js version:** `22` (set the Pages `NODE_VERSION` environment variable if the project does not inherit it).
- **Environment variable:** `VITE_API_BASE_URL=https://<your-render-service>.onrender.com` for the production build.

Cloudflare Pages should use the repository's `package-lock.json` and npm workspaces. Set `VITE_API_BASE_URL` before each production build so the browser calls the Render API; no API credentials belong in frontend variables.

## Security and availability

Only public Instagram URLs are accepted. The API validates canonical Instagram routes, uses fixed `spawn(..., { shell: false })` provider arguments, blocks arbitrary proxying, rate-limits requests, and keeps upstream media URLs server-side. Download and preview links are short-lived HMAC tokens. Instagram availability can change, and some public posts may still require login or fail anonymous extraction.
