FROM node:24-slim AS build
# better-sqlite3 compiles from source.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Build validates env vars; real values come at run time.
RUN cp .env.example .env && npm run build && rm .env && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production DATABASE_URL=/data/poroleague.db
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/build build
COPY drizzle drizzle
COPY scripts/migrate.ts scripts/
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.ts && exec node build"]
