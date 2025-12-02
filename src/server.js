const http = require('http');
const { loadConfig } = require('./config');
const { DocmostClient } = require('./docmostClient');

const baseTools = [
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
  });
  res.end(body);
}

function sendJsonRpc(res, id, payload) {
  const body = JSON.stringify({ jsonrpc: '2.0', id, ...payload });
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
  });
  res.end(body);
}

function sendJsonRpcError(res, id, code, message) {
  return sendJsonRpc(res, id, { error: { code, message } });
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

let tools = baseTools;
let client;
let appConfig;

async function handleToolCall(body) {
  const { tool, params = {} } = body || {};
  if (!tool) {
    throw new Error('El campo "tool" es obligatorio.');
  }

  const isWriteTool = tool === 'create_page' || tool === 'update_page';
  if (appConfig?.readOnly && isWriteTool) {
    throw new Error('El servidor está en modo READ_ONLY, no se permiten operaciones de escritura.');
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

async function handleJsonRpc(body) {
  const { jsonrpc, method, id, params } = body || {};
  if (!jsonrpc || !method) {
    throw new Error('Formato JSON-RPC inválido.');
  }

  switch (method) {
    case 'initialize':
      return { id, result: { capabilities: { tools: { list: true, call: true } } } };
    case 'list_tools':
      return { id, result: { tools } };
    case 'call_tool': {
      const tool = params?.name;
      const toolParams = params?.arguments || {};
      const result = await handleToolCall({ tool, params: toolParams });
      return { id, result: { content: result } };
    }
    default:
      throw new Error(`Método JSON-RPC desconocido: ${method}`);
  }
}

async function bootstrap() {
  appConfig = loadConfig();
  tools = appConfig.readOnly
    ? baseTools.filter((tool) => tool.name !== 'create_page' && tool.name !== 'update_page')
    : baseTools;

  client = new DocmostClient({ baseUrl: appConfig.baseUrl, apiToken: appConfig.apiToken });

  if (!appConfig.apiToken && appConfig.credentials) {
    console.log('Obteniendo token de Docmost mediante autenticación...');
    await client.login(appConfig.credentials.email, appConfig.credentials.password);
    console.log('Token obtenido correctamente.');
  }

  const server = http.createServer(async (req, res) => {
    const { method, url } = req;
    console.log(`[req] ${method} ${url}`);

    // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    });
    return res.end();
  }

  const logHeaders = {
    'user-agent': req.headers['user-agent'],
    host: req.headers.host,
    'content-type': req.headers['content-type'],
    'x-forwarded-for': req.headers['x-forwarded-for'],
    'x-forwarded-proto': req.headers['x-forwarded-proto'],
  };
  console.log('[headers]', JSON.stringify(logHeaders));

  const isWellKnown =
    (url === '/.well-known/mcp' || url === '/mcp/.well-known/mcp') && method === 'GET';

  if (url === '/' && method === 'GET') {
    return sendJson(res, 200, { message: 'Docmost MCP en ejecución', tools });
  }
    if (url === '/' && method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const rpc = await handleJsonRpc(body);
        return sendJsonRpc(res, rpc.id, { result: rpc.result });
      } catch (error) {
        console.error('Error en JSON-RPC /:', error);
        return sendJsonRpcError(res, null, -32600, error.message);
      }
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
        console.error('Error en tool-call:', error);
        return sendJson(res, 400, { error: error.message });
      }
    }

  if ((url === '/mcp' || url === '/mc' || url === '/m') && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const rpc = await handleJsonRpc(body);
      return sendJsonRpc(res, rpc.id, { result: rpc.result });
    } catch (error) {
      console.error('Error en JSON-RPC /mcp:', error);
      return sendJsonRpcError(res, null, -32600, error.message);
    }
  }

  if (isWellKnown) {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || `0.0.0.0:${appConfig.port}`;
    const base = `${proto}://${host}`;

    return sendJson(res, 200, {
      protocol: 'mcp-http-1',
      endpoints: {
        tools: `${base}/mcp/tools`,
        call: `${base}/mcp/tool-call`,
      },
    });
  }

    if (method !== 'GET' && method !== 'POST') {
      return methodNotAllowed(res);
    }

    return notFound(res);
  });

  server.listen(appConfig.port, () => {
    const base = `http://0.0.0.0:${appConfig.port}`;
    console.log(`Servidor MCP listo en ${base}`);
    if (appConfig.readOnly) {
      console.log('Modo READ_ONLY activado: herramientas de escritura no disponibles.');
    }
    console.log('Herramientas disponibles:', tools.map((tool) => tool.name).join(', '));
  });

  process.on('SIGINT', () => {
    console.log('\nDeteniendo servidor...');
    server.close(() => process.exit(0));
  });
}

bootstrap().catch((error) => {
  console.error('No se pudo iniciar el servidor:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('Promesa no manejada:', error);
});
