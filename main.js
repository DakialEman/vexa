'use strict';

// Vexa — proceso principal.
// Punto 1 del plan: una ventana que abre y cierra bien, siempre en modo oscuro.

const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } = require('electron');
const path = require('node:path');

const RUTA_PRELOAD = path.join(__dirname, 'preload.js');
const RUTA_INDEX = path.join(__dirname, 'renderer', 'index.html');

// Color de fondo de la ventana nativa. Va igual al del CSS para que no haya
// un flash blanco entre que abre la ventana y termina de pintar el HTML.
const COLOR_FONDO = '#0b0c0f';

// Modo humo: abre la ventana, confirma que quedo lista y sale solo.
// Sirve para verificar sin manos que la app arranca. Se activa con VEXA_SMOKE=1.
const MODO_HUMO = process.env.VEXA_SMOKE === '1';

/** @type {BrowserWindow | null} */
let ventana = null;

/**
 * Avisa de un error de forma explicita: siempre queda en consola, y ademas
 * se le muestra al usuario salvo que estemos corriendo sin interfaz.
 */
function reportarError(titulo, detalle) {
  console.error(`[vexa] ${titulo}: ${detalle}`);
  if (!MODO_HUMO && app.isReady()) {
    dialog.showErrorBox(titulo, detalle);
  }
}

/**
 * Las URLs externas no se abren dentro de Vexa: por ahora la ventana solo
 * muestra su propia interfaz. Cualquier link http(s) va al navegador del sistema.
 */
function abrirAfuera(url) {
  let destino;
  try {
    destino = new URL(url);
  } catch (error) {
    reportarError('URL invalida', `No se pudo interpretar "${url}": ${error.message}`);
    return;
  }

  if (destino.protocol !== 'http:' && destino.protocol !== 'https:') {
    console.warn(`[vexa] Se ignoro un link con protocolo no permitido: ${destino.protocol}`);
    return;
  }

  shell.openExternal(destino.href).catch((error) => {
    reportarError('No se pudo abrir el link', `${destino.href}\n\n${error.message}`);
  });
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 520,
    backgroundColor: COLOR_FONDO,
    title: 'Vexa',
    // No la mostramos hasta que el HTML este pintado.
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: RUTA_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  ventana.once('ready-to-show', () => {
    ventana.show();
    console.log('[vexa] Ventana lista.');
    if (MODO_HUMO) {
      console.log('[vexa] VEXA_SMOKE=1: cierro la ventana y salgo.');
      app.quit();
    }
  });

  ventana.on('closed', () => {
    ventana = null;
  });

  ventana.webContents.on('did-fail-load', (_evento, codigo, descripcion, urlFallida) => {
    // -3 es ERR_ABORTED: pasa cuando una carga se cancela sola, no es un fallo real.
    if (codigo === -3) return;
    reportarError(
      'No se pudo cargar la interfaz',
      `${urlFallida}\n\nCodigo ${codigo}: ${descripcion}`,
    );
    app.quit();
  });

  ventana.webContents.on('render-process-gone', (_evento, detalles) => {
    reportarError('La ventana se cerro sola', `Motivo: ${detalles.reason}`);
    app.quit();
  });

  ventana.webContents.on('unresponsive', () => {
    console.warn('[vexa] La ventana dejo de responder.');
  });

  // Ni window.open ni los links con target=_blank abren ventanas nuevas.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    abrirAfuera(url);
    return { action: 'deny' };
  });

  // La ventana tampoco navega a otra pagina: solo carga su propia interfaz.
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (url === ventana.webContents.getURL()) return;
    evento.preventDefault();
    abrirAfuera(url);
  });

  ventana.loadFile(RUTA_INDEX).catch((error) => {
    reportarError('No se pudo cargar la interfaz', `${RUTA_INDEX}\n\n${error.message}`);
    app.quit();
  });
}

// Una sola instancia de Vexa a la vez. Si se abre de nuevo, enfocamos la que ya existe.
if (!app.requestSingleInstanceLock()) {
  console.log('[vexa] Ya hay una instancia abierta. Cierro esta.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!ventana) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.focus();
  });

  // La app es oscura siempre, sin importar el tema del sistema operativo.
  nativeTheme.themeSource = 'dark';

  app.whenReady().then(crearVentana).catch((error) => {
    reportarError('Vexa no pudo iniciar', error.stack ?? error.message);
    app.exit(1);
  });

  app.on('activate', () => {
    // En macOS es normal que la app siga viva sin ventanas; volvemos a abrirla.
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });

  app.on('window-all-closed', () => {
    // En macOS la convencion es quedarse en el dock; en Windows y Linux se cierra.
    if (process.platform !== 'darwin') app.quit();
  });
}

// Datos que la interfaz muestra en pantalla.
ipcMain.handle('vexa:info', () => ({
  nombre: app.getName(),
  version: app.getVersion(),
  electron: process.versions.electron,
  chromium: process.versions.chrome,
  node: process.versions.node,
  plataforma: process.platform,
}));

// Cierre pedido desde el boton de la interfaz.
ipcMain.on('vexa:cerrar', (evento) => {
  const ventanaOrigen = BrowserWindow.fromWebContents(evento.sender);
  if (ventanaOrigen) ventanaOrigen.close();
});

// Nada de errores silenciosos: si algo revienta, se ve y la app sale con codigo 1.
process.on('uncaughtException', (error) => {
  reportarError('Error inesperado en Vexa', error.stack ?? String(error));
  app.exit(1);
});

process.on('unhandledRejection', (motivo) => {
  const detalle = motivo instanceof Error ? (motivo.stack ?? motivo.message) : String(motivo);
  reportarError('Error inesperado en Vexa', detalle);
  app.exit(1);
});
