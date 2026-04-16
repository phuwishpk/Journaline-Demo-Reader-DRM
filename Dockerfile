# Node.js LTS Alpine image for Journaline Reader App
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci

# Copy source code and public assets
COPY src ./src
COPY public ./public
COPY models ./models
COPY middleware ./middleware
COPY server.js .
COPY vite.config.ts .
COPY index.html .
COPY docker-entrypoint.sh .

# Make entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Expose ports
# 5173 for Vite dev server (frontend HMR)
# 5005 for Express server (backend API)
EXPOSE 5173 5005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5005/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run entrypoint script
CMD ["./docker-entrypoint.sh"]

