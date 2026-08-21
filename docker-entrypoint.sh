#!/bin/sh
echo "🚀 Starting Journaline Reader App..."

# Build frontend only if dist doesn't exist (skip rebuild on container restart)
# Use the explicit UI build script which runs TypeScript build + Vite
if [ ! -d "dist" ]; then
  echo "Building frontend..."
  npm run build:ui
else
  echo "Frontend already built, skipping build step"
fi

echo "Starting servers..."
exec npx concurrently \
  --names "EXPRESS,VITE" \
  --prefix "[{name}]" \
  --kill-others-on-exit \
  "nodemon server.js" \
  "vite --host 0.0.0.0"