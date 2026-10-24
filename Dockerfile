FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PDF_BROWSER_CACHE_DIR=/app/.cache/pdf-browser
COPY package*.json ./
COPY src ./src
# Install Chrome and its Linux libraries during the image build, not an API call.
RUN apt-get update \
    && PDF_BROWSER_INSTALL_DEPS=true npm ci --omit=dev \
    && rm -rf /var/lib/apt/lists/* \
    && chown -R node:node /app
USER node
COPY --chown=node:node public ./public
EXPOSE 3000
CMD ["npm", "start"]
