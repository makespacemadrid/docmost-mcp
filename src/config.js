const DEFAULT_PORT = 3000;

function parseBoolean(value) {
  if (typeof value !== 'string') return false;
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

function loadConfig() {
  const { DOCMOST_BASE_URL, DOCMOST_API_TOKEN, DOCMOST_EMAIL, DOCMOST_PASSWORD, READ_ONLY, PORT } = process.env;

  if (!DOCMOST_BASE_URL) {
    throw new Error('Define DOCMOST_BASE_URL para saber a qué instancia de Docmost apuntar.');
  }

  const hasToken = Boolean(DOCMOST_API_TOKEN);
  const hasCredentials = Boolean(DOCMOST_EMAIL && DOCMOST_PASSWORD);

  if (!hasToken && !hasCredentials) {
    throw new Error('Define DOCMOST_API_TOKEN o DOCMOST_EMAIL y DOCMOST_PASSWORD para autenticar las llamadas hacia Docmost.');
  }

  return {
    baseUrl: DOCMOST_BASE_URL.replace(/\/$/, ''),
    apiToken: hasToken ? DOCMOST_API_TOKEN : null,
    credentials: hasCredentials
      ? {
          email: DOCMOST_EMAIL,
          password: DOCMOST_PASSWORD,
        }
      : null,
    readOnly: parseBoolean(READ_ONLY),
    port: Number(PORT) || DEFAULT_PORT,
  };
}

module.exports = { loadConfig };
