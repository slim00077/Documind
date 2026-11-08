# syntax=docker/dockerfile:1
# DocuMind web client - React + Vite, served as static files by unprivileged nginx.
#   docker build --build-arg VITE_API_URL=https://api.example.com -t documind-frontend ./frontend
# VITE_API_URL is baked in at build time. Empty = same origin (Kubernetes ingress routes /api).

# ---------- Stage 1: build the static bundle ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_API_URL=""
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---------- Stage 2: static file server + /api reverse proxy (non-root, port 8080) ----------
FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
# API_UPSTREAM: where /api/* is proxied (compose: http://backend:3000,
# Kubernetes: http://backend.documind.svc.cluster.local:3000).
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    API_UPSTREAM=http://backend:3000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
