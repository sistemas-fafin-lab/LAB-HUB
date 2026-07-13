# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# LAB-HUB API (apps/api, Fastify) — imagem multi-stage.
# @lab-hub/shared é type-only (todos os imports são `import type`), então some no
# build: o runtime não precisa do pacote nem das dev deps do monorepo.
# ─────────────────────────────────────────────────────────────────────────────

# 1) Builder — instala o workspace e compila shared (gera os tipos) + api.
FROM node:22-alpine AS builder
WORKDIR /app
# Manifests primeiro (camada de deps fica em cache enquanto o código muda).
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci
# Fontes necessárias ao build.
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build --workspace=@lab-hub/shared \
 && npm run build --workspace=@lab-hub/api

# 2) Prod deps — só as dependências de runtime da API, isoladas e enxutas.
FROM node:22-alpine AS proddeps
WORKDIR /app
COPY apps/api/package.json ./package.json
# @lab-hub/shared é apenas de tipos (apagado no build) — não vai pro runtime.
RUN npm pkg delete dependencies.@lab-hub/shared \
 && npm install --omit=dev --no-audit --no-fund

# 3) Runtime — imagem final mínima.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3333
WORKDIR /app
COPY --from=proddeps /app/node_modules ./node_modules
COPY --from=builder  /app/apps/api/dist ./dist
# package.json com "type":"module" — sem ele o Node trataria os .js como CommonJS.
COPY --from=builder  /app/apps/api/package.json ./package.json
EXPOSE 3333
USER node
# Health no /ping usando o fetch nativo do Node 22 (sem depender de curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
