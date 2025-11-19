const DEFAULT_PORT = 3000;

function loadConfig() {
  const { DOCMOST_BASE_URL, DOCMOST_API_TOKEN, PORT } = process.env;

  if (!DOCMOST_BASE_URL) {
    throw new Error('Define DOCMOST_BASE_URL para saber a qué instancia de Docmost apuntar.');
  }
  if (!DOCMOST_API_TOKEN) {
    throw new Error('Define DOCMOST_API_TOKEN para autenticar las llamadas hacia Docmost.');
  }

  return {
    baseUrl: DOCMOST_BASE_URL.replace(/\/$/, ''),
    apiToken: DOCMOST_API_TOKEN,
    port: Number(PORT) || DEFAULT_PORT,
  };
}

module.exports = { loadConfig };
