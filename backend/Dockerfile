# syntax=docker/dockerfile:1
# DocuMind API - NestJS + Prisma 7 + pgvector.
#   docker build -t documind-backend ./backend
# Debian slim (glibc) rather than Alpine: onnxruntime-node, sharp and bcrypt ship glibc binaries.

# ---------- Stage 1: install, generate the Prisma client, compile TypeScript ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
# openssl: required by the Prisma schema engine (migrate deploy) and its platform detection.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Skip onnxruntime-node's optional CUDA download: the CPU runtime is bundled in the npm package.
ENV ONNXRUNTIME_NODE_INSTALL=skip
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# prisma.config.ts requires DATABASE_URL to be set; `prisma generate` never connects to it.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build \
 && npm prune --omit=dev --no-audit --no-fund
# Bake the local embedding model (Xenova/all-MiniLM-L6-v2, 384 dims) into the image so
# containers never download it at runtime.
RUN node -e "import('@huggingface/transformers').then(({ pipeline }) => pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')).then(() => console.log('embedding model cached'))"

# ---------- Stage 2: minimal runtime (no sources, no dev dependencies, no secrets) ----------
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/scripts/ensure-pgvector.js ./scripts/ensure-pgvector.js
# Uploaded documents and organization logos. Mount persistent storage on /app/uploads
# (docker volume / Render disk / Kubernetes PVC), otherwise files are lost on restart.
RUN mkdir -p /app/uploads/documents /app/uploads/org-logos && chown -R node:node /app/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# Migrations are NOT run here: they run once per release (Render pre-deploy command,
# Kubernetes init container, compose `migrate` service) via `npm run migrate:deploy`.
CMD ["node", "dist/src/main.js"]
