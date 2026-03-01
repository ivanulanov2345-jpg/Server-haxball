#!/usr/bin/env node
'use strict';

/**
 * Runner para Railway (Node.js):
 * - Abre Chromium con Playwright.
 * - Entra a https://www.haxball.com/headless?token=...
 * - Inyecta el script local haxball-todo-en-uno.js dentro de la página.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const HEADLESS_URL = 'https://www.haxball.com/headless';
const BOT_SCRIPT_PATH = path.join(__dirname, 'haxball-todo-en-uno.js');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Falta variable de entorno requerida: ${name}`);
  return value;
}

async function main() {
  const token = requiredEnv('HAXBALL_TOKEN');
  const roomName = process.env.HAXBALL_ROOM_NAME || '';

  if (!fs.existsSync(BOT_SCRIPT_PATH)) {
    throw new Error(`No se encontró el script del bot: ${BOT_SCRIPT_PATH}`);
  }

  const script = fs.readFileSync(BOT_SCRIPT_PATH, 'utf8');
  const url = `${HEADLESS_URL}?token=${encodeURIComponent(token)}`;

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    console.log(`[HEADLESS:${msg.type()}] ${text}`);
  });

  page.on('pageerror', (error) => {
    console.error('[HEADLESS:pageerror]', error);
  });

  console.log('Abriendo Headless Host...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Espera a que HBInit exista.
  await page.waitForFunction(() => typeof window.HBInit === 'function', null, { timeout: 60_000 });

  // Opcional: override de room name desde variable Railway.
  const patchedScript = roomName
    ? `${script}\n\nif (typeof ROOM_CONFIG !== 'undefined') ROOM_CONFIG.roomName = ${JSON.stringify(roomName)};`
    : script;

  console.log('Inyectando bot...');
  await page.addScriptTag({ content: patchedScript });

  console.log('✅ Bot inyectado. Railway runner activo.');

  const shutdown = async (signal) => {
    console.log(`Recibido ${signal}. Cerrando browser...`);
    try { await browser.close(); } catch (_) {}
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Mantener proceso vivo.
  await new Promise(() => {});
}

main().catch((error) => {
  console.error('❌ Error iniciando Railway runner:', error.message);
  process.exit(1);
});
