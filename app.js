// app.js - Production entry point for hosting servers
// Loads and runs the Express server

// Since package.json has "type": "module", we can use ES6 import/export
// This is compatible with modern Node.js (v12+)

try {
  // Import and start the server
  import('./server.js')
    .then(() => {
      console.log('✓ Server started successfully');
    })
    .catch((err) => {
      console.error('✗ Failed to start server:', err.message);
      console.error(err.stack);
      process.exit(1);
    });
} catch (err) {
  console.error('✗ Failed to load app:', err);
  process.exit(1);
}
