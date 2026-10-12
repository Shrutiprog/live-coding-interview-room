import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connectDb } from './db.js';
import routes from './routes.js';
import { attachYjsServer } from './yjsServer.js';

export async function createServer() {
  const dbMode = await connectDb();
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
  app.use(express.json({ limit: '300kb' }));
  app.use('/api', routes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React app in production (one deployable service).
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res) => res.sendFile(path.join(dist, 'index.html'))); // SPA fallback
  }

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = http.createServer(app);
  attachYjsServer(server);
  return { server, dbMode };
}

// Start only when run directly (the test imports createServer instead).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, dbMode } = await createServer();
  const port = process.env.PORT || 4000;
  server.listen(port, () => console.log(`Server running on http://localhost:${port}  (storage: ${dbMode})`));
}
