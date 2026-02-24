import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupSocketHandlers } from './server/socket-handlers.js';
import apiRouter from './server/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
  // Generous timeouts for mobile connections
  pingTimeout: 30000,
  pingInterval: 25000,
  // Allow reconnection with buffered events
  connectionStateRecovery: {
    maxDisconnectionDuration: 60000, // 1 minute
  },
});

// Parse JSON bodies for API
app.use(express.json());

// Serve static files from Vite build output
app.use(express.static(path.join(__dirname, 'dist')));

// API routes
app.use('/api', apiRouter);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Set up Socket.IO handlers
setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
