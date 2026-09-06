# Multi-stage build: compile the React frontend, then run it from the
# Express server as a single production process on one port.

FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

# Documents (encrypted) and the SQLite database — mount these as persistent
# volumes on your hosting platform, or every redeploy wipes all HR data.
VOLUME ["/app/server/data", "/app/server/storage"]

EXPOSE 4000
CMD ["node", "src/index.js"]
