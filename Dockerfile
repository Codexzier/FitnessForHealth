# ---------- Build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci
COPY client/package.json client/package-lock.json client/
RUN cd client && npm ci

COPY server server
COPY client client
RUN cd client && npm run build \
 && cd ../server && npm run build && npm prune --omit=dev

# ---------- Laufzeit ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8095 \
    DATA_DIR=/data \
    STATIC_DIR=/app/client/dist
WORKDIR /app

COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

VOLUME /data
EXPOSE 8095
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8095)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
