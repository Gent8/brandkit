# Build context: repo root (so we can COPY src/*.js)
# Build:   docker build -t brandkit-mcp:latest -f mcp/Dockerfile .
FROM node:20-alpine

WORKDIR /app

COPY mcp/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# brandkit core (palette + trim + pipeline + providers) — same source as the CLI.
COPY src/palette.js ./palette.js
COPY src/trim.js ./trim.js
COPY src/pipeline.js ./pipeline.js
COPY src/providers/ ./providers/

# MCP entry
COPY mcp/server.js ./server.js

# stdio MCP — the client pipes JSON-RPC to stdin/stdout
ENTRYPOINT ["node", "/app/server.js"]
