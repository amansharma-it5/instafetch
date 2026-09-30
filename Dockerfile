FROM node:22-bookworm-slim AS pot-provider-build

ARG BGUTIL_VERSION=2.0.0
ARG BGUTIL_COMMIT=37169ee2656e08c5c2e5dc9df4c598c0cb4c88a8

WORKDIR /opt/bgutil

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    ca-certificates \
    git \
    build-essential \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg62-turbo-dev \
    libgif-dev \
    librsvg2-dev \
  && git clone --depth 1 --branch "${BGUTIL_VERSION}" https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git . \
  && test "$(git rev-parse HEAD)" = "${BGUTIL_COMMIT}" \
  && cd server \
  && npm ci --no-audit --no-fund \
  && npx tsc \
  && npm prune --omit=dev \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* .git

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY apps apps
COPY packages packages

RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV POT_PROVIDER_ENTRYPOINT=/opt/bgutil/server/build/main.js
ENV POT_PROVIDER_PORT=4416
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
    ca-certificates \
    ffmpeg \
    python3 \
    python3-pip \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
  && python3 -m pip install --no-cache-dir --break-system-packages \
    'yt-dlp[default]==2026.8.19' \
    gallery-dl==1.32.14 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY --from=pot-provider-build /opt/bgutil/server/build /opt/bgutil/server/build
COPY --from=pot-provider-build /opt/bgutil/server/node_modules /opt/bgutil/server/node_modules

RUN python3 -m pip install --no-cache-dir --break-system-packages \
    bgutil-ytdlp-pot-provider==2.0.0

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

RUN chown -R node:node /app /opt/bgutil
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '3001') + '/health/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "apps/api/dist/server.js"]
