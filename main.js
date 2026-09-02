'use strict';

// Vexa — proceso principal.
// La ventana tiene dos capas: la barra de navegacion (interfaz propia de Vexa)
// y abajo el navegador interno, que es donde se ve la pagina.

const { app, BrowserWindow, WebContentsView, dialog, ipcMain, nativeTheme, shell } = require('electron');
const path = require('node:path');

const { esNavegable, interpretarEntrada } = require('./src/navegacion.js');

const RUTA_PRELOAD = path.join(__dirname, 'preload.js');
const RUTA_INDEX = path.join(__dirname, 'renderer', 'index.html');

// Color de fondo de la ventana nativa. Va igual al del CSS para que no haya
// un flash blanco entre que abre la ventana y termina de pintar el HTML.
const COLOR_FONDO = '#0b0c0f';

// Alto de la barra de navegacion, en pixeles. Tiene que coincidir con el CSS.
const ALTO_BARRA = 56;

// Sesion propia y persistente: las cookies y sesiones de los sitios sobreviven
// entre aperturas de Vexa, como en un navegador normal.
const PARTICION = 'persist:vexa';

// Muchos sitios de video le cierran la puerta a los navegadores que no conocen.
// Nos presentamos como un Chrome comun, que es lo que Vexa realmente es por dentro.
const AGENTE_DE_USUARIO =
  `Mozilla/5.0 (${process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'}) ` +
  `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;

// Permisos que los sitios pueden pedir. Solo dejamos pantalla completa, que es
// lo que necesita un reproductor de video. Camara, microfono y ubicacion, no.
const PERMISOS_PERMITIDOS = new Set(['fullscreen']);

// Modo humo: abre la ventana, confirma que quedo lista y sale solo.
// Sirve para verificar sin manos que la app arranca. Se activa con VEXA_SMOKE=1.
const MODO_HUMO = process.env.VEXA_SMOKE === '1';

// Si ademas se pasa VEXA_SMOKE_URL, la prueba navega a esa direccion y no sale
// hasta confirmar que la pagina cargo. Asi se verifica el navegador entero.
const URL_DE_HUMO = MODO_HUMO ? (process.env.VEXA_SMOKE_URL ?? '') : '';

// Cuanto esperamos, como maximo, a que cargue la pagina de la prueba.
const ESPERA_MAXIMA_DE_HUMO = 30_000;

/** @type {BrowserWindow | null} */
let ventana = null;

/** @type {WebContentsView | null} */
let vista = null;

/** Estado del navegador interno que la barra necesita conocer. */
const navegador = {
  visible: false,
  pantallaCompleta: false,
  ultimaUrlPedida: '',
  popupsBloqueados: 0,
  ultimoPopupBloqueado: '',
};

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

/** Manda un mensaje a la barra de navegacion, si sigue viva. */
function avisarBarra(canal, datos) {
  if (!ventana || ventana.isDestroyed() || ventana.webContents.isDestroyed()) return;
  ventana.webContents.send(canal, datos);
}

/** Las URLs externas que Vexa no abre adentro van al navegador del sistema. */
function abrirAfuera(url) {
  if (!esNavegable(url)) {
    console.warn(`[vexa] Se ignoro un link que no es una pagina web: ${url}`);
    return;
  }
  shell.openExternal(url).catch((error) => {
    reportarError('No se pudo abrir el link', `${url}\n\n${error.message}`);
  });
}

// ---------------------------------------------------------------------------
// Navegador interno
// ---------------------------------------------------------------------------

/** Foto del estado actual del navegador, para pintar la barra. */
function estadoActual() {
  if (!vista || vista.webContents.isDestroyed()) {
    return {
      visible: false,
      cargando: false,
      url: '',
      titulo: '',
      puedeAtras: false,
      puedeAdelante: false,
      popupsBloqueados: navegador.popupsBloqueados,
      hayPopupBloqueado: false,
    };
  }

  const contenido = vista.webContents;
  const historial = contenido.navigationHistory;

  return {
    visible: navegador.visible,
    cargando: contenido.isLoading(),
    url: contenido.getURL(),
    titulo: contenido.getTitle(),
    puedeAtras: historial.canGoBack(),
    puedeAdelante: historial.canGoForward(),
    popupsBloqueados: navegador.popupsBloqueados,
    hayPopupBloqueado: navegador.ultimoPopupBloqueado !== '',
  };
}

function avisarEstado() {
  avisarBarra('vexa:estado', estadoActual());
}

/** Muestra u oculta el navegador interno (oculto = se ve la pantalla de Vexa). */
function mostrarNavegador(visible) {
  navegador.visible = visible;
  if (vista) vista.setVisible(visible);
  avisarEstado();
}

/** Acomoda el navegador interno debajo de la barra, o a pantalla completa. */
function ubicarVista() {
  if (!ventana || ventana.isDestroyed() || !vista) return;

  const { width, height } = ventana.getContentBounds();
  const arriba = navegador.pantallaCompleta ? 0 : ALTO_BARRA;

  vista.setBounds({
    x: 0,
    y: arriba,
    width,
    height: Math.max(0, height - arriba),
  });
}

/** Actualiza el titulo de la ventana con el de la pagina abierta. */
function actualizarTitulo() {
  if (!ventana || ventana.isDestroyed()) return;
  const titulo = vista && !vista.webContents.isDestroyed() ? vista.webContents.getTitle() : '';
  ventana.setTitle(navegador.visible && titulo ? `${titulo} — Vexa` : 'Vexa');
}

/** Carga una direccion ya validada en el navegador interno. */
function irA(url) {
  if (!vista || vista.webContents.isDestroyed()) {
    reportarError('El navegador interno no esta disponible', 'La vista se cerro inesperadamente.');
    return;
  }

  navegador.ultimaUrlPedida = url;
  mostrarNavegador(true);

  vista.webContents.loadURL(url).catch((error) => {
    // did-fail-load ya avisa del detalle; aca solo dejamos rastro en consola.
    console.error(`[vexa] Fallo la carga de ${url}: ${error.message}`);
  });
}

/** Vuelve a la pantalla de inicio de Vexa, sin cerrar la pagina cargada. */
function volverAlInicio() {
  mostrarNavegador(false);
  actualizarTitulo();
}

function crearNavegador() {
  vista = new WebContentsView({
    webPreferences: {
      partition: PARTICION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Sin preload: en las paginas de internet no inyectamos nada de Vexa.
      webviewTag: false,
    },
  });

  vista.setBackgroundColor(COLOR_FONDO);
  vista.setVisible(false);

  const contenido = vista.webContents;
  contenido.setUserAgent(AGENTE_DE_USUARIO);

  // Los sitios no pueden pedir camara, microfono, ubicacion ni notificaciones.
  contenido.session.setPermissionRequestHandler((_contenido, permiso, responder) => {
    const permitido = PERMISOS_PERMITIDOS.has(permiso);
    if (!permitido) console.log(`[vexa] Permiso denegado a la pagina: ${permiso}`);
    responder(permitido);
  });

  // Vexa mira peliculas, no descarga archivos. Las descargas se cancelan y se avisan.
  contenido.session.on('will-download', (evento, item) => {
    evento.preventDefault();
    const nombre = item.getFilename();
    console.log(`[vexa] Descarga cancelada: ${nombre}`);
    avisarBarra('vexa:aviso', `Se cancelo una descarga ("${nombre}"). Vexa no baja archivos.`);
  });

  // Las ventanas emergentes se bloquean: en los sitios de peliculas son publicidad.
  // Igual guardamos la ultima, porque a veces el reproductor real se abre asi.
  contenido.setWindowOpenHandler(({ url }) => {
    navegador.popupsBloqueados += 1;
    if (esNavegable(url)) navegador.ultimoPopupBloqueado = url;
    console.log(`[vexa] Ventana emergente bloqueada (${navegador.popupsBloqueados}): ${url}`);
    avisarEstado();
    return { action: 'deny' };
  });

  // Dentro del navegador se navega libre, pero solo por paginas web.
  const frenarSiNoEsWeb = (evento, url) => {
    if (esNavegable(url)) return;
    evento.preventDefault();
    console.warn(`[vexa] Navegacion bloqueada por protocolo no permitido: ${url}`);
    avisarBarra('vexa:aviso', 'Se bloqueo un link que intentaba salir del navegador.');
  };
  contenido.on('will-navigate', frenarSiNoEsWeb);
  contenido.on('will-redirect', frenarSiNoEsWeb);

  contenido.on('did-start-loading', avisarEstado);
  contenido.on('did-stop-loading', avisarEstado);
  contenido.on('did-navigate', avisarEstado);
  contenido.on('did-navigate-in-page', avisarEstado);

  contenido.on('page-title-updated', () => {
    actualizarTitulo();
    avisarEstado();
  });

  contenido.on('did-fail-load', (_evento, codigo, descripcion, urlFallida, esPrincipal) => {
    // -3 es ERR_ABORTED: la carga se cancelo sola (por ejemplo, otra navegacion).
    if (!esPrincipal || codigo === -3) return;
    console.error(`[vexa] No cargo ${urlFallida} (${codigo}: ${descripcion})`);
    mostrarNavegador(false);
    avisarBarra('vexa:error-de-carga', {
      url: urlFallida || navegador.ultimaUrlPedida,
      codigo,
      descripcion,
    });
    actualizarTitulo();
  });

  contenido.on('render-process-gone', (_evento, detalles) => {
    console.error(`[vexa] El navegador interno se cayo: ${detalles.reason}`);
    mostrarNavegador(false);
    avisarBarra('vexa:error-de-carga', {
      url: navegador.ultimaUrlPedida,
      codigo: 0,
      descripcion: `La pagina se cerro sola (${detalles.reason}).`,
    });
  });

  contenido.on('unresponsive', () => {
    avisarBarra('vexa:aviso', 'La pagina dejo de responder. Podes esperar o recargar.');
  });

  // Pantalla completa del reproductor: la vista tapa tambien la barra.
  contenido.on('enter-html-full-screen', () => {
    navegador.pantallaCompleta = true;
    ubicarVista();
  });
  contenido.on('leave-html-full-screen', () => {
    navegador.pantallaCompleta = false;
    ubicarVista();
  });

  // Atajos de teclado mientras el foco esta en la pagina.
  contenido.on('before-input-event', (evento, entrada) => {
    if (entrada.type !== 'keyDown') return;
    const atajo = interpretarAtajo(entrada);
    if (!atajo) return;
    evento.preventDefault();
    ejecutarAtajo(atajo);
  });

  ventana.contentView.addChildView(vista);
  ubicarVista();
}

/** Traduce una tecla a una accion del navegador, o null si no es un atajo. */
function interpretarAtajo(entrada) {
  const control = entrada.control || entrada.meta;

  if (entrada.alt && entrada.key === 'ArrowLeft') return 'atras';
  if (entrada.alt && entrada.key === 'ArrowRight') return 'adelante';
  if (entrada.key === 'F5') return 'recargar';
  if (control && entrada.key.toLowerCase() === 'r') return 'recargar';
  if (control && entrada.key.toLowerCase() === 'l') return 'foco-barra';
  if (entrada.key === 'Escape') return 'detener';
  return null;
}

function ejecutarAtajo(atajo) {
  if (!vista || vista.webContents.isDestroyed()) return;
  const historial = vista.webContents.navigationHistory;

  switch (atajo) {
    case 'atras':
      if (historial.canGoBack()) historial.goBack();
      break;
    case 'adelante':
      if (historial.canGoForward()) historial.goForward();
      break;
    case 'recargar':
      vista.webContents.reload();
      break;
    case 'detener':
      vista.webContents.stop();
      break;
    case 'foco-barra':
      if (ventana && !ventana.isDestroyed()) ventana.webContents.focus();
      avisarBarra('vexa:foco-barra', null);
      break;
    default:
      console.warn(`[vexa] Atajo desconocido: ${atajo}`);
  }
}

// ---------------------------------------------------------------------------
// Ventana
// ---------------------------------------------------------------------------

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: COLOR_FONDO,
    title: 'Vexa',
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
    if (MODO_HUMO && URL_DE_HUMO === '') {
      console.log('[vexa] VEXA_SMOKE=1: cierro la ventana y salgo.');
      app.quit();
    }
  });

  ventana.on('resize', ubicarVista);
  ventana.on('maximize', ubicarVista);
  ventana.on('unmaximize', ubicarVista);
  ventana.on('enter-full-screen', ubicarVista);
  ventana.on('leave-full-screen', ubicarVista);

  ventana.on('closed', () => {
    ventana = null;
    vista = null;
  });

  ventana.webContents.on('did-fail-load', (_evento, codigo, descripcion, urlFallida) => {
    if (codigo === -3) return;
    reportarError('No se pudo cargar la interfaz', `${urlFallida}\n\nCodigo ${codigo}: ${descripcion}`);
    app.quit();
  });

  ventana.webContents.on('render-process-gone', (_evento, detalles) => {
    reportarError('La ventana se cerro sola', `Motivo: ${detalles.reason}`);
    app.quit();
  });

  // La barra de Vexa no abre ventanas nuevas ni navega a otro lado.
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    abrirAfuera(url);
    return { action: 'deny' };
  });

  ventana.webContents.on('will-navigate', (evento, url) => {
    if (url === ventana.webContents.getURL()) return;
    evento.preventDefault();
    abrirAfuera(url);
  });

  ventana.webContents.on('before-input-event', (evento, entrada) => {
    if (entrada.type !== 'keyDown') return;
    const atajo = interpretarAtajo(entrada);
    // Ctrl+L lo maneja la barra sola, que ya tiene el foco.
    if (!atajo || atajo === 'foco-barra') return;
    evento.preventDefault();
    ejecutarAtajo(atajo);
  });

  ventana
    .loadFile(RUTA_INDEX)
    .then(() => {
      crearNavegador();
      avisarEstado();
      if (URL_DE_HUMO !== '') probarNavegador(URL_DE_HUMO);
    })
    .catch((error) => {
      reportarError('No se pudo cargar la interfaz', `${RUTA_INDEX}\n\n${error.message}`);
      app.quit();
    });
}

/**
 * Prueba de humo del navegador interno: navega, confirma que la pagina cargo
 * y sale. Con codigo 0 si cargo, con 1 si fallo o si tardo demasiado.
 */
function probarNavegador(destino) {
  const contenido = vista.webContents;

  const reloj = setTimeout(() => {
    console.error(`[vexa] La prueba tardo mas de ${ESPERA_MAXIMA_DE_HUMO} ms y se corta.`);
    app.exit(1);
  }, ESPERA_MAXIMA_DE_HUMO);

  contenido.once('did-finish-load', () => {
    clearTimeout(reloj);
    console.log(`[vexa] Pagina cargada: "${contenido.getTitle()}" en ${contenido.getURL()}`);
    console.log(`[vexa] Navegador visible: ${navegador.visible}`);
    app.quit();
  });

  contenido.once('did-fail-load', (_evento, codigo, descripcion, urlFallida) => {
    clearTimeout(reloj);
    console.error(`[vexa] La prueba no pudo cargar ${urlFallida} (${codigo}: ${descripcion}).`);
    app.exit(1);
  });

  const resultado = interpretarEntrada(destino);
  if (!resultado.ok) {
    clearTimeout(reloj);
    console.error(`[vexa] La prueba recibio una direccion invalida: ${resultado.motivo}`);
    app.exit(1);
    return;
  }

  irA(resultado.url);
}

// ---------------------------------------------------------------------------
// Mensajes desde la barra de navegacion
// ---------------------------------------------------------------------------

ipcMain.handle('vexa:info', () => ({
  nombre: app.getName(),
  version: app.getVersion(),
  electron: process.versions.electron,
  chromium: process.versions.chrome,
  node: process.versions.node,
  plataforma: process.platform,
}));

ipcMain.handle('vexa:estado', () => estadoActual());

ipcMain.handle('vexa:navegar', (_evento, texto) => {
  const resultado = interpretarEntrada(texto);
  if (!resultado.ok) return resultado;
  irA(resultado.url);
  return resultado;
});

ipcMain.on('vexa:accion', (_evento, accion) => {
  switch (accion) {
    case 'atras':
    case 'adelante':
    case 'recargar':
    case 'detener':
      ejecutarAtajo(accion);
      break;
    case 'inicio':
      volverAlInicio();
      break;
    case 'reintentar':
      if (navegador.ultimaUrlPedida) irA(navegador.ultimaUrlPedida);
      break;
    case 'abrir-popup-bloqueado': {
      const url = navegador.ultimoPopupBloqueado;
      navegador.ultimoPopupBloqueado = '';
      if (url) irA(url);
      else avisarBarra('vexa:aviso', 'No hay ninguna ventana bloqueada para abrir.');
      break;
    }
    default:
      console.warn(`[vexa] Accion desconocida desde la barra: ${accion}`);
  }
});

ipcMain.on('vexa:cerrar', (evento) => {
  const ventanaOrigen = BrowserWindow.fromWebContents(evento.sender);
  if (ventanaOrigen) ventanaOrigen.close();
});

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

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
