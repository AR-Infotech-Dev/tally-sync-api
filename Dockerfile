FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PDF_BROWSER_NO_SANDBOX=true
# Install browser and fonts in the image used by Coolify.
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY src ./src
RUN npm ci --omit=dev && mkdir -p /app/storage/connector-releases && chown -R node:node /app
USER node
COPY --chown=node:node public ./public
EXPOSE 3000
CMD ["npm", "start"]
