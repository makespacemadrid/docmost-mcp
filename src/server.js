const http = require('http');
const { loadConfig } = require('./config');
const { DocmostClient } = require('./docmostClient');

const config = loadConfig();
const client = new DocmostClient({ baseUrl: config.baseUrl, apiToken: config.apiToken });

const tools = [
  {
    name: 'list_spaces',
    description: 'Devuelve los espacios disponibles en Docmost.',
    params: {},
  },
  {
    name: 'list_pages',
    description: 'Lista páginas dentro de un espacio. Requiere spaceId.',
    params: { spaceId: 'string' },
  },
  {
    name: 'get_page',
    description: 'Obtiene una página por su id.',
    params: { pageId: 'string' },
  },
  {
    name: 'search_pages',
    description: 'Busca páginas por texto libre.',
    params: { query: 'string' },
  },
  {
    name: 'create_page',
    description: 'Crea una página nueva. Requiere title, content y spaceId.',
    params: { title: 'string', content: 'string', spaceId: 'string', folderId: 'string?' },
  },
  {
    name: 'update_page',
    description: 'Actualiza una página existente. Requiere pageId y los campos a modificar.',
    params: { pageId: 'string', payload: 'object' },
  },
];

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { error: 'Ruta no encontrada' });
}

function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'Método no permitido' });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5_000_000) {
        reject(new Error('El cuerpo de la petición es demasiado grande.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = data ? JSON.parse(data) : {};
        resolve(parsed);
      } catch (error) {
        reject(new Error('El cuerpo debe ser JSON válido.'));
      }
    });
    req.on('error', reject);
  });
}

async function handleToolCall(body) {
  const { tool, params = {} } = body || {};
  if (!tool) {
    throw new Error('El campo "tool" es obligatorio.');
  }

  switch (tool) {
    case 'list_spaces':
      return client.listSpaces();
    case 'list_pages':
      return client.listPages(params.spaceId);
    case 'get_page':
      return client.getPage(params.pageId);
    case 'search_pages':
      return client.searchPages(params.query);
    case 'create_page':
      return client.createPage({
        title: params.title,
        content: params.content,
        spaceId: params.spaceId,
        folderId: params.folderId,
      });
    case 'update_page':
      return client.updatePage(params.pageId, params.payload);
    default:
      throw new Error(`Herramienta desconocida: ${tool}`);
  }
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (url === '/' && method === 'GET') {
    return sendJson(res, 200, { message: 'Docmost MCP en ejecución', tools });
  }

  if (url === '/health' && method === 'GET') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (url === '/mcp/tools' && method === 'GET') {
    return sendJson(res, 200, { tools });
  }

  if (url === '/mcp/tool-call' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const result = await handleToolCall(body);
      return sendJson(res, 200, { result });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url === '/.well-known/mcp' && method === 'GET') {
    return sendJson(res, 200, {
      protocol: 'mcp-http-1',
      endpoints: {
        tools: '/mcp/tools',
        call: '/mcp/tool-call',
      },
    });
  }

  if (method !== 'GET' && method !== 'POST') {
    return methodNotAllowed(res);
  }

  return notFound(res);
});

server.listen(config.port, () => {
  const base = `http://0.0.0.0:${config.port}`;
  console.log(`Servidor MCP listo en ${base}`);
  console.log('Herramientas disponibles:', tools.map((tool) => tool.name).join(', '));
});

process.on('unhandledRejection', (error) => {
  console.error('Promesa no manejada:', error);
});

process.on('SIGINT', () => {
  console.log('\nDeteniendo servidor...');
  server.close(() => process.exit(0));
});
