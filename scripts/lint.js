#!/usr/bin/env node
/**
 * Lint de cortesía: en ausencia de dependencias externas, este script
 * se limita a validar que package.json es válido y que los archivos
 * fuente existen. Mantiene una salida distinta de cero solo si detecta
 * un error que impida ejecutar el servidor.
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const packagePath = path.join(root, 'package.json');
const serverPath = path.join(root, 'src', 'server.js');
const clientPath = path.join(root, 'src', 'docmostClient.js');

try {
  JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  if (!fs.existsSync(serverPath)) {
    console.error('No se encontró src/server.js');
    process.exitCode = 1;
  }
  if (!fs.existsSync(clientPath)) {
    console.error('No se encontró src/docmostClient.js');
    process.exitCode = 1;
  }
} catch (error) {
  console.error('package.json inválido:', error.message);
  process.exitCode = 1;
}
