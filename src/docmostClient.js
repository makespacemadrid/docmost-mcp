const { URL } = require('url');

class DocmostClient {
  constructor({ baseUrl, apiToken }) {
    this.baseUrl = baseUrl;
    this.apiToken = apiToken;
  }

  async request(path, options = {}) {
    const url = new URL(path, this.baseUrl).toString();
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiToken}`,
      ...(options.headers || {}),
    };

    const response = await fetch(url, { ...options, headers });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = typeof body === 'string' ? body : JSON.stringify(body);
      throw new Error(`Docmost devolvió ${response.status}: ${message}`);
    }

    return body;
  }

  listSpaces() {
    return this.request('/api/spaces');
  }

  listPages(spaceId) {
    if (!spaceId) {
      throw new Error('spaceId es obligatorio para listar páginas.');
    }
    return this.request(`/api/spaces/${spaceId}/pages`);
  }

  getPage(pageId) {
    if (!pageId) {
      throw new Error('pageId es obligatorio para obtener una página.');
    }
    return this.request(`/api/pages/${pageId}`);
  }

  searchPages(query) {
    if (!query) {
      throw new Error('query es obligatorio para buscar.');
    }
    const encoded = encodeURIComponent(query);
    return this.request(`/api/search?query=${encoded}`);
  }

  createPage(payload) {
    const { title, content, spaceId, folderId } = payload || {};
    if (!title || !content || !spaceId) {
      throw new Error('title, content y spaceId son obligatorios para crear una página.');
    }

    return this.request('/api/pages', {
      method: 'POST',
      body: JSON.stringify({ title, content, spaceId, folderId }),
    });
  }

  updatePage(pageId, payload) {
    if (!pageId) {
      throw new Error('pageId es obligatorio para actualizar una página.');
    }
    return this.request(`/api/pages/${pageId}`, {
      method: 'PUT',
      body: JSON.stringify(payload || {}),
    });
  }
}

module.exports = { DocmostClient };
