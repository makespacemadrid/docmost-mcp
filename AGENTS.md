# Docmost MCP · Guía para agentes

Versiones
- Servidor MCP: **0.1.1** (`package.json` y descriptor MCP).
- Imagen publicada: `ghcr.io/makespacemadrid/docmost-mcp:latest` (tags por commit y release).

Endpoints MCP (JSON-RPC y descriptor)
- Descriptor: `/.well-known/mcp` y `/mcp/.well-known/mcp`.
- JSON-RPC (initialize/list_tools/call_tool): `POST /`, `/mcp`, `/mc`, `/m`.
- Salud: `GET /health`.

Autenticación hacia Docmost (definida en el contenedor/servicio)
- Opción 1: `DOCMOST_API_TOKEN` (Bearer).
- Opción 2: `DOCMOST_EMAIL` + `DOCMOST_PASSWORD` para obtener la cookie `authToken`.
- `DOCMOST_BASE_URL` es obligatorio (ej. `https://demo.docmost.com`).
- `READ_ONLY=true` oculta las herramientas de escritura (`create_page`, `update_page`).

Herramientas MCP expuestas
- `list_spaces` → lista espacios.
- `list_pages` (spaceId) → lista páginas de un espacio.
- `get_page` (pageId) → obtiene contenido.
- `search_pages` (query) → busca por texto.
- `create_page` (title, content, spaceId[, folderId]) → crea página (omitida si READ_ONLY).
- `update_page` (pageId, payload) → actualiza campos permitidos (omitida si READ_ONLY).

Ejemplos rápidos
```bash
# Descriptor MCP
curl -s http://localhost:3000/.well-known/mcp | jq

# Inicializar cliente JSON-RPC
curl -s http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# Buscar páginas
curl -s http://localhost:3000/mcp/tool-call \
  -H "Content-Type: application/json" \
  -d '{"tool":"search_pages","params":{"query":"onboarding"}}'
```

Ejemplo de despliegue para agentes (Docker Compose)
```bash
cp .env.example .env  # ajusta DOCMOST_BASE_URL y credenciales
docker compose up -d --pull always
# servidor disponible en http://localhost:3000
```

Notas para clientes MCP
- Usa la URL base `http(s)://<host>:3000`.
- El descriptor MCP incluye nombre y versión; no requiere headers adicionales.
- Los logs del servidor muestran `[req]` y `[headers]` para trazar llamadas de agentes.
