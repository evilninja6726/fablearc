FROM node:22-bookworm-slim

WORKDIR /app

# Copy package manifests first for layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source and build the production bundle
COPY . .
RUN npm run build

# Persistent directory for SQLite WAL database (writable by Hugging Face Spaces uid=1000)
RUN mkdir -p /app/data && chmod -R 777 /app/data
ENV NODE_ENV=production
ENV PORT=7860
ENV STREAMZ_DB_PATH=/app/data/streamz_commercial.sqlite

EXPOSE 7860

# Starts Vite Production Preview Server with all /api/* and FFmpeg middlewares mounted
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "7860"]
