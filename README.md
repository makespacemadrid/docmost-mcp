# Docmost MCP

Servidor MCP HTTP ligero para interactuar con una instancia de Docmost a través de herramientas expuestas vía HTTP. No depende de paquetes externos, únicamente de Node.js (v18+).

## Requisitos
- Node.js 18 o superior (para contar con `fetch` nativo)
- Variables de entorno:
  - `DOCMOST_BASE_URL`: URL base de la instancia de Docmost (ej. `https://demo.docmost.com`).
  - `DOCMOST_API_TOKEN`: token de autenticación Bearer.
  - `PORT` (opcional): puerto en el que escuchará el servidor. Por defecto 3000.

## Instalación
No hay dependencias externas. Basta con clonar el repositorio y definir las variables de entorno.

```bash
export DOCMOST_BASE_URL="https://demo.docmost.com"
export DOCMOST_API_TOKEN="<tu-token>"
export PORT=3000
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

## Desarrollo
- `npm start`: inicia el servidor.
- `npm run dev`: inicia el servidor en modo desarrollo (solo cambia la variable `NODE_ENV`).
- `npm run lint`: valida que los archivos clave existan.

## Notas
- Las rutas hacia Docmost asumen los endpoints REST convencionales (por ejemplo, `/api/spaces`, `/api/pages`). Ajusta `src/docmostClient.js` si tu instancia difiere.
- Al no depender de librerías externas, el proyecto funciona incluso sin acceso al registro de npm.
