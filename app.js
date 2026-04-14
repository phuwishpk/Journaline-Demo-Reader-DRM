// app.js - Entry point for hosting server
// This file loads server.js which contains the Express application
import('./server.js').catch(err => {
  console.error('Failed to load server:', err);
  process.exit(1);
});
