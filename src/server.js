const http = require('http');
const { version: appVersion } = require('../package.json');
const { loadConfig } = require('./config');
const { DocmostClient } = require('./docmostClient');

const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'docmost-mcp', version: appVersion || 'dev' };
const MCP_INSTRUCTIONS =
  'Herramientas MCP para leer y, si READ_ONLY es false, escribir en Docmost. ' +
  'Usa list_spaces para descubrir espacios, list_pages para ver páginas de un espacio ' +
  'y get_page/search_pages para leer contenido. ' +
  'Cuando necesites la URL pública de una página, llama a get_page_url con el pageId obtenido.';

const baseTools = [
  {
    name: 'list_spaces',
    description: 'Devuelve los espacios disponibles en Docmost.',
    params: {},
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_pages',
    description: 'Lista páginas dentro de un espacio. Requiere spaceId.',
    params: { spaceId: 'string' },
    inputSchema: {
      type: 'object',
      properties: {
        spaceId: { type: 'string', description: 'ID del espacio' },
      },
      required: ['spaceId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_page',
    description: 'Obtiene una página por su id.',
    params: { pageId: 'string' },
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página' },
      },
      required: ['pageId'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_pages',
    description: 'Busca páginas por texto libre.',
    params: { query: 'string' },
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_page',
    description: 'Crea una página nueva. Requiere title, content y spaceId.',
    params: { title: 'string', content: 'string', spaceId: 'string', folderId: 'string?' },
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título de la página' },
        content: { type: 'string', description: 'Contenido markdown/HTML de la página' },
        spaceId: { type: 'string', description: 'ID del espacio en el que se crea la página' },
        folderId: {
          type: ['string', 'null'],
          description: 'ID de la carpeta/página padre (opcional)',
        },
      },
      required: ['title', 'content', 'spaceId'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_page',
    description: 'Actualiza una página existente. Requiere pageId y los campos a modificar.',
    params: { pageId: 'string', payload: 'object' },
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página' },
        payload: {
          type: 'object',
          description: 'Campos a modificar (ver API de Docmost)',
        },
      },
      required: ['pageId', 'payload'],
    },
  },
  {
    name: 'get_page_url',
    description:
      'Devuelve la URL pública a partir de pageId. Úsalo tras list_pages/get_page/search_pages cuando necesites la URL compartible.',
    params: { pageId: 'string' },
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'ID de la página' },
      },
      required: ['pageId'],
      additionalProperties: false,
    },
  },
];

function formatResultAsContent(result) {
  if (result === null || result === undefined) {
    return [{ type: 'text', text: 'Sin contenido devuelto.' }];
  }

  if (typeof result === 'string') {
    return [{ type: 'text', text: result }];
  }

  try {
    return [{ type: 'text', text: JSON.stringify(result, null, 2) }];
  } catch (error) {
    return [{ type: 'text', text: String(result) }];
  }
}

function toJsonRpcTools(tools) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema || { type: 'object' },
  }));
}

function normalizeToolName(name) {
  if (typeof name !== 'string') return name;
  const parts = name.split('__');
  return parts[0] || name;
}

function slugifyTitle(title) {
  if (!title || typeof title !== 'string') return null;
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

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

  const toolName = normalizeToolName(tool);

  const isWriteTool = toolName === 'create_page' || toolName === 'update_page';
  if (appConfig?.readOnly && isWriteTool) {
    throw new Error('El servidor está en modo READ_ONLY, no se permiten operaciones de escritura.');
  }

  switch (toolName) {
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
    case 'get_page_url': {
      const pageId = params.pageId;
      if (!pageId) throw new Error('pageId es obligatorio para obtener la URL.');
      const page = await client.getPage(pageId);
      const slugId = page?.slugId;
      const spaceSlug = page?.space?.slug;
      const titleSlug = slugifyTitle(page?.title);
      if (!slugId || !spaceSlug) {
        throw new Error('No se pudo resolver slugId o space.slug para construir la URL.');
      }
      const slugSegment = titleSlug ? `${titleSlug}-${slugId}` : slugId;
      const url = `${appConfig.baseUrl}/s/${spaceSlug}/p/${slugSegment}`;
      return { url, pageId, slugId, spaceSlug, slugSegment };
    }
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
    case 'initialize': {
      const clientInfo = params?.clientInfo;
      if (clientInfo) {
        console.log('[jsonrpc:init]', JSON.stringify(clientInfo));
      }

      return {
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          serverInfo: SERVER_INFO,
          capabilities: { tools: { list: true, call: true, listChanged: true } },
          instructions: MCP_INSTRUCTIONS,
        },
      };
    }
    case 'list_tools':
    case 'tools/list':
      return { id, result: { tools: toJsonRpcTools(tools) } };
    case 'call_tool': {
      const tool = params?.name || params?.tool || params?.toolName || params?.id;
      const toolParams = params?.arguments || params?.args || {};
      const result = await handleToolCall({ tool, params: toolParams });
      return { id, result: { content: formatResultAsContent(result) } };
    }
    case 'tools/call': {
      const tool = params?.name || params?.tool || params?.toolName || params?.id;
      const toolParams = params?.arguments || params?.args || {};
      const result = await handleToolCall({ tool, params: toolParams });
      return { id, result: { content: formatResultAsContent(result) } };
    }
    case 'ping':
      return { id, result: { pong: true } };
    case 'notifications/initialized':
      return { id, result: { ok: true } };
    default:
      const error = new Error(`Método JSON-RPC desconocido: ${method}`);
      error.code = -32601;
      throw error;
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
      let body;
      try {
        body = await parseJsonBody(req);
        const rpc = await handleJsonRpc(body);
        return sendJsonRpc(res, rpc.id, { result: rpc.result });
      } catch (error) {
        console.error('Error en JSON-RPC /:', error);
        const id = body?.id ?? null;
        const code = typeof error.code === 'number' ? error.code : -32600;
        return sendJsonRpcError(res, id, code, error.message);
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
    let body;
    try {
      body = await parseJsonBody(req);
      const rpc = await handleJsonRpc(body);
      return sendJsonRpc(res, rpc.id, { result: rpc.result });
    } catch (error) {
      console.error('Error en JSON-RPC /mcp:', error);
      const id = body?.id ?? null;
      const code = typeof error.code === 'number' ? error.code : -32600;
      return sendJsonRpcError(res, id, code, error.message);
    }
  }

  if (isWellKnown) {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || `0.0.0.0:${appConfig.port}`;
    const base = `${proto}://${host}`;

    return sendJson(res, 200, {
      protocol: 'mcp-http-1',
      mcp: { version: MCP_PROTOCOL_VERSION },
      server: SERVER_INFO,
      instructions: MCP_INSTRUCTIONS,
      transport: {
        type: 'http',
        endpoint: `${base}/mcp`,
      },
      capabilities: { tools: { listChanged: true } },
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
