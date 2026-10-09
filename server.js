// ====================================================================
// Prometheus Elegance — Servidor Local Alternativo em Node.js
// Executa com: node server.js
// Nenhuma dependência externa necessária (módulos nativos http e fs)
// ====================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOADS_DIR = path.join(ROOT, 'assets', 'uploads');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

// Garante existência das pastas
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, '[]', 'utf8');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const sendJson = (res, statusCode, data) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
};

const getBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  // 1. API: /api/products
  if (pathname === '/api/products' || pathname === '/api/products/') {
    if (req.method === 'GET') {
      try {
        const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
        return sendJson(res, 200, data);
      } catch {
        return sendJson(res, 200, []);
      }
    }
    if (req.method === 'POST') {
      try {
        const body = await getBody(req);
        if (!body || !body.name || !body.category || typeof body.price !== 'number') {
          return sendJson(res, 400, { error: 'Campos obrigatórios ausentes ou inválidos.' });
        }
        const list = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8') || '[]');
        const newItem = {
          id: `prod-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
          name: String(body.name),
          price: Number(body.price),
          description: String(body.description || ''),
          category: String(body.category),
          image: String(body.image || ''),
        };
        list.unshift(newItem);
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(list, null, 2), 'utf8');
        return sendJson(res, 201, newItem);
      } catch (err) {
        return sendJson(res, 400, { error: 'JSON malformado.' });
      }
    }
  }

  // 2. API: /api/products/:id
  const matchId = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (matchId) {
    const id = decodeURIComponent(matchId[1]);
    const list = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8') || '[]');

    if (req.method === 'PUT') {
      try {
        const body = await getBody(req);
        const index = list.findIndex((item) => item.id === id);
        if (index === -1) return sendJson(res, 404, { error: 'Produto não encontrado.' });
        list[index] = {
          ...list[index],
          name: String(body.name || list[index].name),
          price: Number(body.price ?? list[index].price),
          description: String(body.description ?? list[index].description),
          category: String(body.category || list[index].category),
          image: String(body.image ?? list[index].image),
        };
        fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(list, null, 2), 'utf8');
        return sendJson(res, 200, list[index]);
      } catch (err) {
        return sendJson(res, 400, { error: 'Erro ao processar atualização.' });
      }
    }

    if (req.method === 'DELETE') {
      const filtered = list.filter((item) => item.id !== id);
      fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(filtered, null, 2), 'utf8');
      return sendJson(res, 200, { success: true, id });
    }
  }

  // 3. API: /api/upload
  if (pathname === '/api/upload' && req.method === 'POST') {
    try {
      const body = await getBody(req);
      if (!body || !body.data || !body.contentType) {
        return sendJson(res, 400, { error: 'Dados da imagem inválidos.' });
      }
      const allowed = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
      const ext = allowed[body.contentType];
      if (!ext) return sendJson(res, 400, { error: 'Tipo não suportado. Use JPG, PNG ou WebP.' });

      const buffer = Buffer.from(body.data, 'base64');
      if (buffer.length > 4 * 1024 * 1024) {
        return sendJson(res, 400, { error: 'Imagem excede limite de 4MB.' });
      }
      const filename = `foto-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}${ext}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
      return sendJson(res, 201, { url: `./assets/uploads/${filename}` });
    } catch {
      return sendJson(res, 500, { error: 'Erro ao salvar imagem.' });
    }
  }

  // 4. Arquivos Estáticos
  let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  if (relativePath === 'admin' || relativePath === 'admin/') relativePath = 'admin/index.html';

  const safePath = path.normalize(path.join(ROOT, relativePath));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Acesso proibido');
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Recurso não encontrado');
    }
    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(safePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Prometheus Elegance rodando em http://localhost:${PORT}/ (Painel: http://localhost:${PORT}/admin)`);
});
