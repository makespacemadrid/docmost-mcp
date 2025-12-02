const { URL } = require('url');

class DocmostClient {
  constructor({ baseUrl, apiToken }) {
    this.baseUrl = baseUrl;
    this.apiToken = apiToken;
    this.authCookie = null;
  }

  async request(path, options = {}) {
    const url = new URL(path, this.baseUrl).toString();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (this.apiToken) {
      headers.Authorization = `Bearer ${this.apiToken}`;
    } else if (this.authCookie) {
      headers.Cookie = `authToken=${this.authCookie}`;
    }

    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = typeof body === 'string' ? body : JSON.stringify(body);
      throw new Error(`Docmost devolvió ${response.status}: ${message}`);
    }

    if (contentType.includes('text/html') || (typeof body === 'string' && body.toLowerCase().includes('<!doctype html'))) {
      throw new Error('Docmost devolvió HTML en lugar de JSON. Revisa que la ruta API sea correcta.');
    }

    if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
      return body.data;
    }

    return body;
  }

  async post(path, body) {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    });
  }

  listSpaces() {
    return this.post('/api/spaces', { page: 1, limit: 50 });
  }

  async listPages(spaceId) {
    if (!spaceId) {
      throw new Error('spaceId es obligatorio para listar páginas.');
    }
    const items = [];
    let page = 1;
    let hasNext = true;
    let lastMeta = null;

    while (hasNext) {
      const result = await this.post('/api/pages/sidebar-pages', { spaceId, page });
      const pageItems = result?.items || [];
      items.push(...pageItems);
      lastMeta = result?.meta || null;
      hasNext = Boolean(lastMeta?.hasNextPage);
      page += 1;
    }

    return { items, meta: lastMeta };
  }

  getPage(pageId) {
    if (!pageId) {
      throw new Error('pageId es obligatorio para obtener una página.');
    }
    return this.post('/api/pages/info', { pageId });
  }

  searchPages(query) {
    if (!query) {
      throw new Error('query es obligatorio para buscar.');
    }
    return this.post('/api/search', { query });
  }

  createPage(payload) {
    const { title, content, spaceId, folderId } = payload || {};
    if (!title || !content || !spaceId) {
      throw new Error('title, content y spaceId son obligatorios para crear una página.');
    }

    return this.post('/api/pages/create', {
      title,
      content,
      spaceId,
      parentPageId: folderId || null,
    });
  }

  updatePage(pageId, payload) {
    if (!pageId) {
      throw new Error('pageId es obligatorio para actualizar una página.');
    }
    return this.post('/api/pages/update', { pageId, ...(payload || {}) });
  }

  async login(email, password) {
    if (!email || !password) {
      throw new Error('email y password son obligatorios para autenticarse.');
    }

    const url = new URL('/api/auth/login', this.baseUrl).toString();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof body === 'string' ? body : JSON.stringify(body);
      throw new Error(`Docmost devolvió ${response.status} al iniciar sesión: ${message}`);
    }

    const rawCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : response.headers.get('set-cookie');
    const cookies = Array.isArray(rawCookies)
      ? rawCookies
      : rawCookies
        ? [rawCookies]
        : [];

    const authCookie = cookies.find((cookie) => cookie.startsWith('authToken='));
    if (!authCookie) {
      throw new Error('No se pudo obtener la cookie authToken desde Docmost.');
    }

    const token = authCookie.split(';')[0].split('=')[1];
    if (!token) {
      throw new Error('No se pudo extraer el valor de authToken.');
    }

    this.authCookie = token;
    return token;
  }
}

module.exports = { DocmostClient };
