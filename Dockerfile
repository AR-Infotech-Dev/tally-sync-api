FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY src ./src
# PDF generation is JavaScript-only; no browser or OS graphics packages.
RUN npm ci --omit=dev && mkdir -p /app/storage/connector-releases && chown -R node:node /app
USER node
COPY --chown=node:node public ./public
EXPOSE 3000
CMD ["npm", "start"]
