#!/usr/bin/env node
// Baut das Frontend für den ESP32 (VITE_TARGET=esp32), komprimiert alle Dateien mit gzip
// und schreibt sie als C-Arrays nach FitnessForHealth/web_assets.h.
//
// Aufruf (im Projektordner):  node esp32/tools/build-web.mjs
// Voraussetzung: Node.js 20+ und einmalig "npm install" im Ordner client/.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const clientDir = path.join(root, 'client');
const outDir = path.join(clientDir, 'dist-esp32');
const header = path.join(root, 'esp32/FitnessForHealth/web_assets.h');

if (!process.argv.includes('--skip-build')) {
  console.log('Baue Frontend (ESP32-Variante) …');
  execSync('npx vite build --outDir dist-esp32 --emptyOutDir', {
    cwd: clientDir,
    stdio: 'inherit',
    env: { ...process.env, VITE_TARGET: 'esp32' },
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const files = walk(outDir).sort();
let out = `// AUTOMATISCH ERZEUGT von esp32/tools/build-web.mjs – nicht von Hand ändern.
// Enthält das gzip-komprimierte Frontend (VITE_TARGET=esp32).
#pragma once
#include <Arduino.h>

struct WebAsset {
  const char *path;
  const char *mime;
  const uint8_t *data;
  size_t len;
};

`;
const table = [];
let total = 0;
files.forEach((file, i) => {
  const rel = '/' + path.relative(outDir, file).split(path.sep).join('/');
  const gz = zlib.gzipSync(fs.readFileSync(file), { level: 9 });
  total += gz.length;
  const mime = MIME[path.extname(file)] ?? 'application/octet-stream';
  const bytes = [];
  for (let j = 0; j < gz.length; j += 24) {
    bytes.push('  ' + Array.from(gz.subarray(j, j + 24), (b) => `0x${b.toString(16).padStart(2, '0')}`).join(','));
  }
  out += `// ${rel} (${gz.length} Bytes gzip)\nstatic const uint8_t ASSET_${i}[] PROGMEM = {\n${bytes.join(',\n')}\n};\n\n`;
  table.push(`  {"${rel}", "${mime}", ASSET_${i}, ${gz.length}}`);
  console.log(`  ${rel.padEnd(40)} ${String(gz.length).padStart(7)} Bytes`);
});
out += `static const WebAsset WEB_ASSETS[] = {\n${table.join(',\n')}\n};\nstatic const size_t WEB_ASSET_COUNT = ${table.length};\n`;
fs.writeFileSync(header, out);
console.log(`\n${table.length} Dateien, ${(total / 1024).toFixed(1)} KB → ${path.relative(root, header)}`);
