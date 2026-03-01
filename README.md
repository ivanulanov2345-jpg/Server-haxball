# Haxball Bot en Railway (Node.js)

Este repo ahora incluye:

- `haxball-todo-en-uno.js` (tu bot principal)
- `railway-runner.js` (runner para ejecutar el bot en Railway usando Playwright)

## Requisitos

1. Un token de Headless Host de Haxball.
2. Cuenta en Railway.
3. Repo subido a GitHub.

## 1) Obtener el token de Haxball

1. Ve a la página de token de Haxball Headless (la oficial de tokens).
2. Genera tu token.
3. Guárdalo (lo usarás como `HAXBALL_TOKEN` en Railway).

## 2) Subir el proyecto

Sube estos archivos a tu repo:

- `haxball-todo-en-uno.js`
- `railway-runner.js`
- `package.json`
- `README.md`

## 3) Crear proyecto en Railway

1. Entra a Railway → **New Project**.
2. Elige **Deploy from GitHub Repo**.
3. Selecciona tu repositorio.

Railway detectará Node.js por `package.json` y ejecutará `npm install` + `npm start`.

## 4) Variables de entorno (MUY IMPORTANTE)

En Railway → tu servicio → **Variables**, agrega:

- `HAXBALL_TOKEN` = `tu_token_headless`
- `HAXBALL_ROOM_NAME` = `Nombre opcional de tu sala` (opcional)

## 5) Deploy

1. Haz deploy/redeploy.
2. Revisa logs: deberías ver:
   - `Abriendo Headless Host...`
   - `Inyectando bot...`
   - `✅ Bot inyectado. Railway runner activo.`

## 6) Verificar que funciona

- Busca tu sala en Haxball por nombre.
- En logs de Railway deberían aparecer eventos del bot (`[HEADLESS:...]`).

## Solución de problemas

### Error de token

Si falla al iniciar, revisa `HAXBALL_TOKEN`.

### No aparece la sala

- Verifica `ROOM_CONFIG.public` y `geo` en `haxball-todo-en-uno.js`.
- Revisa que no haya error en logs al inyectar el script.

### Error de Chromium/Playwright

Si Railway no logra abrir Chromium, reintenta deploy. Si persiste, usa una imagen/base con soporte para Playwright o agrega un Dockerfile con dependencias de Chromium.

## Comando local de sintaxis

```bash
npm run check
```


