# The relay alone (server/relay.js, docs/31/04): a hosting tier builds this, the game does not.
FROM node:22-alpine
WORKDIR /app
COPY server/relay.js server/relay.js
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/relay.js"]
