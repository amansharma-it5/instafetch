# InstaFetch

InstaFetch is a public Instagram and YouTube media downloader for content that each platform exposes without authentication. It never collects Instagram/YouTube credentials, browser cookies, or private-account access.

The repository is an npm-workspaces monorepo:

- `apps/web`: React, Vite, TypeScript, Tailwind CSS, and React Router frontend.
- `apps/api`: Express and TypeScript API with platform extraction adapters, bounded temporary media storage, and signed media tokens.
- `packages/shared`: shared Instagram/YouTube URL validation and media types.

## Local development

Requirements:

- Node.js 22 or newer
- npm 10 or newer
- yt-dlp 2026.08.19 with the `default` extra, Node.js 22+, ffmpeg, and ffprobe on `PATH` for live extraction checks

Install and verify the deterministic checks:

```text
npm ci
npm run lint
npm run test
npm run build
npm run e2e
```

Check the deployed frontend and API health endpoints without touching Instagram:

```text
npm run smoke:production
```

For an explicitly supplied public Reel, the same script also validates and resolves that Reel without credentials, cookies, or browser profiles. It prints only status and safe metadata:

```text
npm run smoke:production -- "https://www.instagram.com/reel/<id>/"
```

Run the development applications separately:

```text
npm run dev:api
npm run dev:web
```

The local PO-token provider is optional during ordinary frontend/API development. To run the full YouTube path locally, clone the pinned `bgutil-ytdlp-pot-provider` 2.0.0 release, build its server, install its matching plugin, then set `POT_PROVIDER_ENABLED=true` and `POT_PROVIDER_ENTRYPOINT` to the compiled `server/build/main.js`. The API supervises that server on loopback port `4416`, waits for `/ping`, and shuts it down with the API. No cookies, browser profiles, credentials, or tokens are accepted.

Copy `.env.example` to `.env` for local settings. Never put credentials, cookies, or production secrets in the repository.

The API listens on `0.0.0.0` and port `3001` locally. The web client uses `VITE_API_BASE_URL` and defaults to `http://localhost:3001`. It also includes concise `/privacy`, `/terms`, `/disclaimer`, and `/contact` information pages.

## Environment variables

Backend variables (the root `.env.example` is the template):

- `DOWNLOAD_TOKEN_SECRET`: required in production; use a unique random value of at least 32 characters.
- `WEB_ORIGIN`: one or more comma-separated exact `http://` or `https://` browser origins. Production does not allow wildcard CORS.
- `PORT`: supplied by Render in production; `3001` is the local default.
- `NODE_ENV`: set to `production` on Render.
- `POT_PROVIDER_ENABLED`: optional local switch; production enables the local bgutil HTTP provider automatically.
- `POT_PROVIDER_ENTRYPOINT`: optional local path to the compiled bgutil server entrypoint. The container uses `/opt/bgutil/server/build/main.js`.
- `POT_PROVIDER_PORT`: optional loopback port; defaults to `4416`.
- `YTDLP_PATH`, `FFMPEG_PATH`, `FFPROBE_PATH`, and `GALLERY_DL_PATH`: optional local executable overrides. Container deployments resolve all four tools from `PATH`.

Generate a secret locally without storing it in Git:

```text
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Frontend variable:

- `VITE_API_BASE_URL`: the API origin used at build time, such as the Render service URL.
- `VITE_SITE_URL`: the bare frontend origin used for canonical, social metadata, JSON-LD, robots.txt, sitemap.xml, and social assets. It defaults to `https://instafetch.pages.dev`; set it to the custom domain before a custom-domain build.
- `VITE_ANALYTICS_ENABLED`: optional privacy-safe event sink switch. It defaults to `false`; no analytics events leave the browser unless explicitly enabled by a future sink integration.

`WEB_ORIGIN` uses a comma-separated list of exact browser origins, for example `https://instafetch.pages.dev,https://instafetch.example`. Do not include paths, credentials, wildcards, or trailing route fragments. When a custom frontend domain is added, add that exact origin to `WEB_ORIGIN` and set the same origin in `VITE_SITE_URL` for the next Pages build.

## Launch operations

- **Production URL:** `https://instafetch.pages.dev`
- **Health checks:** `https://instafetch-nm9b.onrender.com/health/live` and `/health/ready`
- **Verified support:** public Instagram Reels with anonymous resolve, preview, and download.
- **Beta support:** public YouTube videos and Shorts up to 20 minutes when yt-dlp exposes genuine anonymous video and audio formats. The production container runs yt-dlp 2026.08.19, the matching EJS package, Node.js EJS runtime, and a supervised loopback bgutil PO-token provider 2.0.0. One video URL is handled at a time; playlist-only links are rejected.
- **Conditional support:** Instagram video posts, photos, carousels, Stories, and legacy TV URLs when Instagram exposes a genuine anonymous media file.
- **Analytics:** disabled by default through `VITE_ANALYTICS_ENABLED=false`. If explicitly enabled, only the allowlisted aggregate event name and safe content category are emitted; URLs, usernames, captions, media URLs, tokens, filenames, IP addresses, and credentials are never included. No third-party tracking vendor is configured.
- **Production verification:** run `npm run smoke:production` for frontend and health checks. To verify a public Reel or YouTube video without credentials, cookies, or browser profiles, pass one explicitly supplied URL to the same command.
- **Feedback:** public visitors can use the Contact page's email links at `instafetch.support@gmail.com` for bug reports or feature requests. Invited testers and collaborators can use the structured GitHub forms. Reports should contain only the platform, link type, browser/device, safe error message, and expected behavior; never include passwords, cookies, authentication tokens, private media links, signed URLs, tokens, or personal information. See [`docs/first-100-users.md`](docs/first-100-users.md) for the first-user checklist and aggregate metric definitions.

## Deploy the API to Render

`render.yaml` defines a free-compatible Docker Web Service named `instafetch-api` with `/health/ready` as its health check. To create it from the repository, use Render's Blueprint flow or configure the same values manually:

1. Select this private GitHub repository and the `main` branch.
2. Choose **Docker** with repository root as the Docker context and `./Dockerfile` as the Dockerfile.
3. Choose the **Free** plan and leave database and persistent-disk settings empty.
4. Set `NODE_ENV=production`.
5. Set `WEB_ORIGIN` to the exact Cloudflare Pages origin, without a path.
6. Set `DOWNLOAD_TOKEN_SECRET` to a newly generated random value. Do not paste it into Git or `render.yaml`.
7. Use `/health/ready` for the health check. Render supplies `PORT`; do not override it.

The API image installs Node.js 22, yt-dlp 2026.08.19 with EJS support, gallery-dl 1.32.14, ffmpeg, ffprobe, and the pinned bgutil provider server/plugin 2.0.0. The API supervises bgutil inside the same container on `127.0.0.1:4416`; the provider is not exposed as a Render port or public service. Readiness is withheld unless Instagram extraction, YouTube/PO-token extraction, ffmpeg, ffprobe, and the download-token secret are available. It runs as a non-root user. Temporary media is kept under the instance's ephemeral filesystem and removed after the short resolution/media TTL; no permanent user files are expected, so no persistent disk is required.

## Deploy the web app to Cloudflare Pages

Create a Pages project from the same repository and `main` branch with these settings:

- **Root directory:** repository root (`/`).
- **Build command:** `npm --workspace @instafetch/shared run build && npm --workspace @instafetch/web run build`.
- **Build output directory:** `apps/web/dist`.
- **Node.js version:** `22` (set the Pages `NODE_VERSION` environment variable if the project does not inherit it).
- **Environment variable:** `VITE_API_BASE_URL=https://<your-render-service>.onrender.com` for the production build.
- **Environment variable:** `VITE_SITE_URL=https://instafetch.pages.dev` for the current Pages origin, or the future custom frontend origin.

Cloudflare Pages should use the repository's `package-lock.json` and npm workspaces. Set both frontend variables before each production build so the browser calls the Render API and generated canonical/social metadata uses the intended site origin; no API credentials belong in frontend variables. For a future custom domain, add the domain to Pages, update `VITE_SITE_URL`, add the exact origin to the backend `WEB_ORIGIN`, and redeploy the affected service(s).

There is no Wrangler configuration or Workers deployment script in this repository. The intended frontend deployment is Cloudflare Pages; the API is a Render Docker service. If GitHub shows a separate `Workers Builds: instafetch` check beside the successful Pages check, it is an account-level Worker connection, not a repository build target. In Cloudflare, open **Workers & Pages → the `instafetch` Worker → Settings → Builds → Disconnect**. Keep the **Pages → `instafetch`** Git connection intact. If the Worker is needed for another project, use **Settings → Builds → Manage** to remove this repository from that Worker and connect the correct repository instead. Cloudflare documents that a Worker build without a matching Wrangler configuration can fail during automatic configuration; do not add a fake `wrangler.toml` to this repository just to satisfy that unrelated check.

## Runtime limits

The API keeps expensive public-media work bounded for the free hosting footprint:

- yt-dlp/gallery-dl extraction and ordinary media processing use bounded 30-second process/request timeouts. YouTube resolution has a bounded 45-second total budget across the default, `mweb`+PO-token, and `android_vr` attempts; YouTube media transfers have a 180-second per-stream budget and YouTube FFmpeg/ffprobe work has a separate 60-second budget. The browser resolve request has a 120-second client timeout.
- A single source or materialized output is limited to 100 MB. The in-memory temporary media cache is limited to 500 MB and 50 files per resolution.
- Resolution records, media files, and HMAC preview/download tokens expire after 5 minutes. Resolution storage is capped at 100 jobs and 100 items per job. Upstream redirects are limited to three hops.
- At most two independent media materialization operations (including FFmpeg work) run at once. There is no queue; additional requests receive `SERVER_BUSY` and can be retried shortly.
- API JSON responses, health responses, and temporary preview/download media use `Cache-Control: no-store` so short-lived tokens and files are not retained by shared caches.
- Expired cache entries are cleaned at most every 60 seconds and all temporary files are removed when the API shuts down. Render's filesystem is ephemeral by design; no permanent user files are expected.

Default request limits are 60 requests/minute globally, 10 Instagram resolve requests/minute, 5 YouTube resolve requests/minute, 60 preview requests/minute, and 20 download requests/minute per client. These limits protect the providers and the small instance; they are not a guarantee of platform availability.

## Security and availability

Only validated public Instagram and YouTube URLs are accepted. The API validates canonical platform routes, uses fixed `spawn(..., { shell: false })` provider arguments, blocks arbitrary proxying, rate-limits requests, and keeps upstream media URLs server-side. Download and preview links are short-lived HMAC tokens. PO tokens stay inside yt-dlp/bgutil and are never returned to the browser, included in API JSON, or logged. Platform availability can change, and some public media may still require login, exceed the duration/size limits, or fail anonymous extraction. YouTube playlist-only, live, DRM-protected, age-restricted, and over-20-minute URLs are rejected safely.
Unknown API paths return a safe JSON 404 response, and oversized JSON request bodies are rejected with a bounded 413 response.
