#!/bin/sh
echo "🚀 Starting Journaline Reader App..."

echo "Building frontend..."
npm run build

echo "Starting servers..."
exec npx concurrently \
  --names "EXPRESS,VITE" \
  --prefix "[{name}]" \
  "nodemon server.js" \
  "vite --host 0.0.0.0"