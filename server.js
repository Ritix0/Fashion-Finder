/**
 * Локальный файловый сервер для Fashion Finder.
 * Нужен только для того, чтобы Google CSE работал на http://
 * вместо file:// (Google CSE падает на file-протоколе).
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { exec } = require('child_process');

const PORT = 8080;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let cleanPath = req.url.split('?')[0];
  if (cleanPath === '/' || cleanPath === '') cleanPath = '/index.html';

  const safePath = path.normalize(decodeURIComponent(cleanPath)).replace(/^(\.\.[\\/])+/, '');
  const filePath = path.join(__dirname, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Файл не найден');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const appUrl = `http://localhost:${PORT}/index.html`;
  console.log(`Fashion Finder: ${appUrl}`);

  if (process.argv.includes('--open')) {
    exec(`start msedge "${appUrl}"`, err => {
      if (err) exec(`start "${appUrl}"`);
    });
  }
});
