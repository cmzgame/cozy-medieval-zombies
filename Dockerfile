# The relay and the server worlds (docs/31/04; item 5, 2026-10-14, docs/02): server/relay.js is the lobby, the pipe,
# and the keeper of the worlds that live on the server; server/world.js is one such world, headless, forked by the relay
# when a guest names its code. A world reads the game's own src/ and its JSON data, never a picture (.dockerignore keeps
# the art, the docs, and the screenshots out). The worlds' files live on the Fly volume at /data (fly.toml).
FROM node:22-alpine
WORKDIR /app
COPY server/ server/
COPY src/ src/
COPY data/ data/
COPY package.json package.json
# The build this image is (the commit, stamped by the deploy workflow): a server world refuses a page of another build
# with "The game was updated" (net.js; the coder agent's review of the plan). "dev" when built by hand.
ARG BUILD_ID=dev
ENV CMZ_BUILD_ID=$BUILD_ID
ENV PORT=8080
ENV DATA_DIR=/data
EXPOSE 8080
CMD ["node", "server/relay.js"]
