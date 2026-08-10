# SigmaDesign — local-first design editor (dev-friendly image)
# Build:  docker compose build
# Run:    docker compose up
FROM node:20-bookworm-slim

# Native deps for better-sqlite3 (and optional canvas toolchain)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/document-model/package.json ./packages/document-model/
COPY packages/fig-format/package.json ./packages/fig-format/
COPY packages/fig-import/package.json ./packages/fig-import/

RUN pnpm install --frozen-lockfile

# App source
COPY . .

ENV NODE_ENV=development
ENV SIGMADESIGN_HOME=/data/sigmadesign
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

# Library data lives on a volume (see docker-compose.yml)
VOLUME ["/data/sigmadesign"]

CMD ["pnpm", "dev"]
