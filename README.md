# Docmost MCP

Servidor MCP HTTP ligero para interactuar con una instancia de Docmost a través de herramientas expuestas vía HTTP. No depende de paquetes externos, únicamente de Node.js (v18+).

Versión actual: **0.1.1** (reflejada en `package.json` y servida en el descriptor MCP).

## Requisitos
- Node.js 18 o superior (para contar con `fetch` nativo)
- Variables de entorno:
  - `DOCMOST_BASE_URL`: URL base de la instancia de Docmost (ej. `https://demo.docmost.com`).
  - Autenticación: **una de estas dos opciones**
    - `DOCMOST_API_TOKEN`: token de autenticación Bearer.
    - `DOCMOST_EMAIL` y `DOCMOST_PASSWORD`: credenciales para obtener automáticamente la cookie `authToken` de Docmost.
  - `PORT` (opcional): puerto en el que escuchará el servidor. Por defecto 3000.
  - `READ_ONLY` (opcional): si vale `true`, no se exponen herramientas que escriban (crear/actualizar páginas).

## Instalación
No hay dependencias externas. Basta con clonar el repositorio y definir las variables de entorno.

```bash
# Opción 1: token
export DOCMOST_BASE_URL="https://demo.docmost.com"
export DOCMOST_API_TOKEN="<tu-token>"
export PORT=3000
export READ_ONLY=false

# Opción 2: login automático por email/contraseña (obtiene authToken)
export DOCMOST_BASE_URL="https://demo.docmost.com"
export DOCMOST_EMAIL="bot@makespacemadrid.org"
export DOCMOST_PASSWORD="tu_clave"
export PORT=3000
export READ_ONLY=false
```

## Uso

Ejecuta el servidor:

```bash
npm start
```

Comprobar estado:

```bash
curl http://localhost:3000/health
```

Descubrir las herramientas MCP disponibles:

```bash
curl http://localhost:3000/mcp/tools
```

Ejecutar una herramienta (`tool-call`):

```bash
curl -X POST http://localhost:3000/mcp/tool-call \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "search_pages",
    "params": { "query": "onboarding" }
  }'
```

## Docker / Docker Compose

Imagen pública: `ghcr.io/makespacemadrid/docmost-mcp:latest` (tag específico por commit: `ghcr.io/makespacemadrid/docmost-mcp:<sha>`).

También puedes ejecutar el servidor con Docker Compose. Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

> Si `.env` ya existe (equipo de pruebas), replica en él cualquier cambio que hagas en `env.example` y luego reconstruye para probar: `docker compose build` y `docker compose up -d`.

Inicia el servicio (descarga la imagen publicada o reconstruye si cambiaste código):

```bash
# usar la imagen publicada
docker compose up -d

# o forzar pull si ya existe
docker compose up -d --pull always

# si modificaste código local y quieres construir
docker compose up --build
```

La API quedará disponible en `http://localhost:3000`. Detén el servicio con `docker compose down`.

## Herramientas expuestas
- `list_spaces`: devuelve los espacios disponibles.
- `list_pages`: requiere `spaceId`, lista las páginas del espacio.
- `get_page`: requiere `pageId`, obtiene el contenido de la página.
- `search_pages`: requiere `query`, busca páginas por texto.
- `create_page`: requiere `title`, `content` y `spaceId`; admite `folderId`.
- `update_page`: requiere `pageId` y `payload` con los campos a modificar.

## Endpoints principales
- `GET /health`: comprobación de vida.
- `GET /mcp/tools`: catálogo de herramientas.
- `POST /mcp/tool-call`: ejecuta una herramienta con un cuerpo JSON `{ tool, params }`.
- `GET /.well-known/mcp`: descriptor mínimo del servidor MCP.
- JSON-RPC (para clientes streamable_http): `POST /mcp` (alias `/mc`, `/m`, `/`) acepta `initialize`, `list_tools`, `call_tool`. Ejemplo:
  ```bash
  curl -s http://localhost:3000/mcp \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
  ```

## Desarrollo
- `npm start`: inicia el servidor.
- `npm run dev`: inicia el servidor en modo desarrollo (solo cambia la variable `NODE_ENV`).
- `npm run lint`: valida que los archivos clave existan.

## Integración con agentes MCP y notas
- URL base sugerida: `http(s)://<host>:3000` (ejemplo en prod: `https://docmost-mcp.mksmad.org`).
- Descriptor MCP disponible en `/.well-known/mcp` y `/mcp/.well-known/mcp`; incluye nombre y versión (`0.1.1`).
- Algunos clientes POSTean al root (`/`); también se responde JSON-RPC `initialize/list_tools/call_tool` en `/`, `/mcp`, `/mc`, `/m`.
- Si `READ_ONLY=true`, las herramientas de escritura (`create_page`, `update_page`) no se publican y las llamadas a ellas serán rechazadas.
- Las rutas hacia Docmost asumen los endpoints REST convencionales (p. ej. `/api/spaces`, `/api/pages`). Ajusta `src/docmostClient.js` si tu instancia difiere.
- Comprobaciones rápidas:
  ```bash
  curl -i https://docmost-mcp.mksmad.org/.well-known/mcp
  curl -s https://docmost-mcp.mksmad.org/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
  ```
  Los logs del servidor imprimen `[req] MÉTODO URL` y `[headers] {...}` para seguir qué solicita el cliente.
