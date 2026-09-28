// Servidor local de desenvolvimento (sem dependências).
// Serve /public e encaminha /api/* para as MESMAS funções usadas na Vercel.
//   npm run dev            -> dados reais (BCB + Yahoo Finance)
//   npm run dev:offline    -> dados simulados (sem internet)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.includes('--offline')) process.env.MOCK_DATA = '1';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

const routes = {
  '/api/selic': () => import('./api/selic.js'),
  '/api/stock': () => import('./api/stock.js'),
};

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (routes[pathname]) {
        const mod = await routes[pathname]();
        return await mod.default(req, res);
      }
      let file = normalize(join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
      if (!file.startsWith(PUBLIC)) throw Object.assign(new Error('forbidden'), { code: 'ENOENT' });
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(e.code === 'ENOENT' ? 'Não encontrado' : `Erro: ${e.message}`);
    }
  })
  .listen(PORT, () => {
    const mode = process.env.MOCK_DATA === '1' ? ' (dados SIMULADOS)' : '';
    console.log(`Selic × Ação rodando em http://localhost:${PORT}${mode}`);
  });
