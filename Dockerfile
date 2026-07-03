# Build the static SPA, then serve it with nginx. There is no backend — the
# image is just a tiny web server in front of a folder of static files.

# ── 1. Build ──────────────────────────────────────────────────────────────────
# glibc (slim), not alpine/musl: the lockfile may be resolved on another OS and
# musl trips Rollup/esbuild's platform-specific binary resolution. This stage is
# discarded anyway — only the tiny nginx image below ships.
FROM node:26-slim AS build
WORKDIR /app

# Install against the lockfile first (this layer is cached until deps change).
# Skip the Electron binary download — this image only builds the web app.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci

# Generate the static site into .output/public (production build → CSP is baked
# into the HTML; see nuxt.config.ts).
COPY . .
RUN npm run generate

# ── 2. Serve ──────────────────────────────────────────────────────────────────
FROM nginx:alpine AS serve
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.output/public /usr/share/nginx/html
EXPOSE 80
# nginx:alpine's default CMD already runs `nginx -g 'daemon off;'`.
