# ====================================================================
# Prometheus Elegance — Servidor Local Alternativo em Python
# Executa com: python server.py
# Nenhuma dependência externa necessária (apenas biblioteca padrão)
# ====================================================================

import http.server
import socketserver
import json
import os
import mimetypes
import base64
import time
import random
import urllib.parse

PORT = int(os.environ.get('PORT', 8000))
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, 'data')
UPLOADS_DIR = os.path.join(ROOT, 'assets', 'uploads')
PRODUCTS_FILE = os.path.join(DATA_DIR, 'products.json')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)
if not os.path.exists(PRODUCTS_FILE):
    with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
        f.write('[]')

class PrometheusHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        json_bytes = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.wfile.write(json_bytes)

    def read_json_body(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return None
        body = self.rfile.read(length).decode('utf-8')
        return json.loads(body)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        if path in ('/api/products', '/api/products/'):
            try:
                with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return self.send_json(200, data)
            except Exception:
                return self.send_json(200, [])

        if path in ('/', ''):
            self.path = '/index.html'
        elif path in ('/admin', '/admin/'):
            self.path = '/admin/index.html'

        return super().do_GET()

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path

        if path in ('/api/products', '/api/products/'):
            try:
                body = self.read_json_body()
                if not body or not body.get('name') or not body.get('category') or body.get('price') is None:
                    return self.send_json(400, {'error': 'Campos obrigatórios ausentes.'})

                with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
                    products = json.load(f)

                new_id = f"prod-{int(time.time() * 1000)}-{random.randint(100, 999)}"
                new_item = {
                    'id': new_id,
                    'name': str(body['name']),
                    'price': float(body['price']),
                    'description': str(body.get('description', '')),
                    'category': str(body['category']),
                    'image': str(body.get('image', ''))
                }
                products.insert(0, new_item)

                with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(products, f, ensure_ascii=False, indent=2)

                return self.send_json(201, new_item)
            except Exception as e:
                return self.send_json(500, {'error': str(e)})

        if path == '/api/upload':
            try:
                body = self.read_json_body()
                if not body or not body.get('data') or not body.get('contentType'):
                    return self.send_json(400, {'error': 'Dados inválidos.'})

                allowed = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}
                ext = allowed.get(body['contentType'])
                if not ext:
                    return self.send_json(400, {'error': 'Formato não suportado.'})

                raw_bytes = base64.b64decode(body['data'])
                if len(raw_bytes) > 4 * 1024 * 1024:
                    return self.send_json(400, {'error': 'Tamanho superior a 4MB.'})

                filename = f"foto-{int(time.time() * 1000)}-{random.randint(1000, 9999)}{ext}"
                dest = os.path.join(UPLOADS_DIR, filename)
                with open(dest, 'wb') as f:
                    f.write(raw_bytes)

                return self.send_json(201, {'url': f"./assets/uploads/{filename}"})
            except Exception as e:
                return self.send_json(500, {'error': str(e)})

        self.send_json(404, {'error': 'Rota não encontrada.'})

    def do_PUT(self):
        path = urllib.parse.urlparse(self.path).path
        if path.startswith('/api/products/'):
            target_id = urllib.parse.unquote(path[len('/api/products/'):])
            try:
                body = self.read_json_body()
                with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
                    products = json.load(f)

                found = None
                for p in products:
                    if p.get('id') == target_id:
                        p['name'] = str(body.get('name', p['name']))
                        p['price'] = float(body.get('price', p['price']))
                        p['description'] = str(body.get('description', p.get('description', '')))
                        p['category'] = str(body.get('category', p['category']))
                        if body.get('image'):
                            p['image'] = str(body['image'])
                        found = p
                        break

                if found:
                    with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
                        json.dump(products, f, ensure_ascii=False, indent=2)
                    return self.send_json(200, found)
                else:
                    return self.send_json(404, {'error': 'Produto não encontrado.'})
            except Exception as e:
                return self.send_json(500, {'error': str(e)})

        self.send_json(404, {'error': 'Rota não encontrada.'})

    def do_DELETE(self):
        path = urllib.parse.urlparse(self.path).path
        if path.startswith('/api/products/'):
            target_id = urllib.parse.unquote(path[len('/api/products/'):])
            try:
                with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
                    products = json.load(f)

                new_list = [p for p in products if p.get('id') != target_id]
                with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(new_list, f, ensure_ascii=False, indent=2)

                return self.send_json(200, {'success': True, 'id': target_id})
            except Exception as e:
                return self.send_json(500, {'error': str(e)})

        self.send_json(404, {'error': 'Rota não encontrada.'})

if __name__ == '__main__':
    os.chdir(ROOT)
    with socketserver.TCPServer(('', PORT), PrometheusHandler) as httpd:
        print(f"Prometheus Elegance rodando em http://localhost:{PORT}/ (Painel: http://localhost:{PORT}/admin)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor encerrado.")
