import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');

const app = express();

// Config injectée à l'exécution (pas au build) : permet de changer l'URL
// PocketBase sans reconstruire l'image Docker, cf. docker-compose.yml.
app.get('/config.js', (_req, res) => {
  res.type('application/javascript');
  res.send(`window.__POCKETBASE_URL__ = ${JSON.stringify(process.env.POCKETBASE_URL || '')};`);
});

app.use(express.static(DIST_DIR));

app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GAUTIER Family running on port ${PORT}`));
