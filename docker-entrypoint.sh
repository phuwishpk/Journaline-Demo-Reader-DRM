#!/bin/sh
# Entrypoint script for Docker - runs both Express and Vite dev servers

echo "🚀 Starting Journaline Reader App..."

# Build frontend first
echo "Building frontend..."
npm run build

# Run Express server and Vite dev server concurrently
exec npx concurrently \
  --names "EXPRESS,VITE" \
  --prefix "[{name}]" \
  "node server.js" \
  "vite --host 0.0.0.0"