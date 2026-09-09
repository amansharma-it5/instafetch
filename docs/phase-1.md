# Phase 1

Phase 1 provides the application foundation only:

- React, Vite, TypeScript, React Router, Tailwind CSS, and Lucide React frontend shell
- Express, Helmet, CORS, rate limiting, Pino, and TypeScript API shell
- `/health/live` and `/health/ready`
- shared strict HTTPS Instagram URL validation for posts, reels, legacy TV URLs, and public story routes

The downloader API, production extraction workflow, temporary media streaming, signed download endpoint, queues, distributed storage, complete interface, and live extraction harness are intentionally deferred until the required external tools are available.
