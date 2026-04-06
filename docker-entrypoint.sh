#!/bin/sh
# Entrypoint script for Docker - runs both Express and Vite dev servers

echo "🚀 Starting Journaline Reader App..."

# Install concurrently if not already installed
npm list concurrently >/dev/null 2>&1 || npm install concurrently

# Run Express server and Vite dev server concurrently
exec npx concurrently \
  "node server.js" \
  "vite"
