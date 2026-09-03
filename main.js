'use strict';

// Vexa — proceso principal.
// La ventana tiene dos capas: la barra de navegacion (interfaz propia de Vexa)
// y abajo el navegador interno, que es donde se ve la pagina.

const {
  app,
  BrowserWindow,
  WebContentsView,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  webFrameMain,
} = require('electron');
const path = require('node:path');

const { esNavegable, interpretarEntrada } = require('./src/navegacion.js');
const { decidir, esYoutube, patronesParaFiltrar } = require('./src/anuncios.js');
const config = require('./src/config.js');
const idiomas = require('./src/idiomas.js');
const { traducirEvento } = require('./src/control.js');
const sesion = require('./src/sesion.js');

const RUTA_PRELOAD = path.join(__dirname, 'preload.js');
const RUTA_INDEX = path.join(__dirname, 'renderer', 'index.html');
const RUTA_SALTA_ANUNCIOS = path.join(__dirname, 'src', 'saltar-anuncios-youtube.js');

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

// Con VEXA_SMOKE_SESION=1 la prueba sigue: captura el navegador interno, arma
// las dos puntas de la conexion y comprueba que llegue video de verdad.
const PROBAR_SESION = MODO_HUMO && process.env.VEXA_SMOKE_SESION === '1';

// Con VEXA_SMOKE_CONTROL=1 la prueba comprueba que un mando del espectador
// llegue de verdad a la pagina: hace un clic y escribe una tecla.
const PROBAR_CONTROL = MODO_HUMO && process.env.VEXA_SMOKE_CONTROL === '1';

// Con VEXA_SMOKE_ANUNCIOS=1 la prueba comprueba que la publicidad quede afuera
// y que lo que la pagina necesita siga entrando.
const PROBAR_ANUNCIOS = MODO_HUMO && process.env.VEXA_SMOKE_ANUNCIOS === '1';

// Con VEXA_SMOKE_PANEL=1 se aprietan los botones de la pantalla, para cazar
// errores de cableado que las otras pruebas no ven.
const PROBAR_PANEL = MODO_HUMO && process.env.VEXA_SMOKE_PANEL === '1';

/**
 * Errores que la pantalla tiro durante una prueba. Un solo "Uncaught" alcanza
 * para que no se conecte ningun boton, asi que cualquier prueba que los vea
 * tiene que fallar aunque lo demas parezca andar.
 */
const erroresDeLaPantalla = [];

/** @type {BrowserWindow | null} */
let ventana = null;

/** @type {WebContentsView | null} */
let vista = null;

/** Configuracion del usuario, leida al arrancar. */
let ajustes = { servidor: '', idioma: idiomas.POR_DEFECTO, aviso: '' };

/** Donde vive el archivo de configuracion. */
function rutaDeConfig() {
  return path.join(app.getPath('userData'), 'config.json');
}

/** Guion que saltea los anuncios de YouTube, leido una sola vez. */
let guionAnuncios = null;

function leerGuionDeAnuncios() {
  if (guionAnuncios !== null) return guionAnuncios;
  try {
    guionAnuncios = require('node:fs').readFileSync(RUTA_SALTA_ANUNCIOS, 'utf8');
  } catch (error) {
    console.error(`[vexa] No se pudo leer el salteador de anuncios: ${error.message}`);
    guionAnuncios = '';
  }
  return guionAnuncios;
}

/** Estado del navegador interno que la barra necesita conocer. */
const navegador = {
  // Hay una pagina cargada (aunque en este momento este tapada).
  hayPagina: false,
  // El panel de "ver juntos" esta abierto y tapa el navegador.
  panelAbierto: false,
  // 'solo' navegas vos; 'anfitrion' ademas transmitis; 'espectador' solo mirás.
  modo: 'solo',
  // El anfitrion le presto el control al espectador.
  controlCedido: false,
  pantallaCompleta: false,
  ultimaUrlPedida: '',
  popupsBloqueados: 0,
  anunciosBloqueados: 0,
  ultimoPopupBloqueado: '',
};

/** El espectador mira lo que abre el otro: no navega por su cuenta. */
function esEspectador() {
  return navegador.modo === 'espectador';
}

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
/**
 * El navegador interno se ve solo si hay una pagina cargada, el panel de sesion
 * esta cerrado y no estamos de espectadores (ahi se ve el video del amigo).
 */
function vistaDebeVerse() {
  return navegador.hayPagina && !navegador.panelAbierto && !esEspectador();
}

function estadoActual() {
  const base = {
    visible: vistaDebeVerse(),
    modo: navegador.modo,
    controlCedido: navegador.controlCedido,
    panelAbierto: navegador.panelAbierto,
    popupsBloqueados: navegador.popupsBloqueados,
    anunciosBloqueados: navegador.anunciosBloqueados,
    hayPopupBloqueado: navegador.ultimoPopupBloqueado !== '',
  };

  if (!vista || vista.webContents.isDestroyed()) {
    return { ...base, visible: false, cargando: false, url: '', titulo: '', puedeAtras: false, puedeAdelante: false };
  }

  const contenido = vista.webContents;
  const historial = contenido.navigationHistory;

  return {
    ...base,
    cargando: contenido.isLoading(),
    url: contenido.getURL(),
    titulo: contenido.getTitle(),
    puedeAtras: historial.canGoBack(),
    puedeAdelante: historial.canGoForward(),
  };
}

function avisarEstado() {
  avisarBarra('vexa:estado', estadoActual());
}

/** Aplica la visibilidad que corresponde y le avisa a la barra. */
function actualizarVista() {
  if (vista && !vista.webContents.isDestroyed()) vista.setVisible(vistaDebeVerse());
  actualizarTitulo();
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
  ventana.setTitle(vistaDebeVerse() && titulo ? `${titulo} — Vexa` : 'Vexa');
}

/** Carga una direccion ya validada en el navegador interno. */
function irA(url) {
  if (!vista || vista.webContents.isDestroyed()) {
    reportarError('El navegador interno no esta disponible', 'La vista se cerro inesperadamente.');
    return;
  }

  navegador.ultimaUrlPedida = url;
  navegador.hayPagina = true;
  navegador.panelAbierto = false;
  actualizarVista();

  vista.webContents.loadURL(url).catch((error) => {
    // did-fail-load ya avisa del detalle; aca solo dejamos rastro en consola.
    console.error(`[vexa] Fallo la carga de ${url}: ${error.message}`);
  });
}

/** Vuelve a la pantalla de inicio de Vexa, sin cerrar la pagina cargada. */
function volverAlInicio() {
  navegador.hayPagina = false;
  actualizarVista();
}

/**
 * Mete el salteador de anuncios en cada marco de YouTube que haya en la pagina
 * (la pestaña principal, y tambien los reproductores incrustados en otros
 * sitios). El guion se cuida solo de no instalarse dos veces.
 */
function inyectarEnUnMarco(marco) {
  const guion = leerGuionDeAnuncios();
  if (guion === '') return;

  marco.executeJavaScript(guion, true).catch((error) => {
    // Que un marco no acepte el guion no es motivo para romper nada.
    console.warn(`[vexa] No se pudo saltear anuncios en ${marco.url}: ${error.message}`);
  });
}

function inyectarSalteadorDeAnuncios(contenido) {
  const principal = contenido.mainFrame;
  if (!principal) return;

  for (const marco of [principal, ...principal.framesInSubtree]) {
    if (esYoutube(marco.url)) inyectarEnUnMarco(marco);
  }
}

/**
 * Corta los pedidos a redes de publicidad y rastreo antes de que salgan.
 * La decision vive en src/anuncios.js, que se testea aparte.
 */
function bloquearAnuncios(sesionDelNavegador) {
  // El filtro es lo que hace que esto no cueste velocidad: sin el, cada imagen
  // y cada script de cada pagina tendria que pasar por aca.
  const filtro = { urls: patronesParaFiltrar() };

  sesionDelNavegador.webRequest.onBeforeRequest(filtro, (detalles, responder) => {
    const decision = decidir(detalles.url, detalles.referrer);

    if (!decision.bloquear) {
      responder({ cancel: false });
      return;
    }

    navegador.anunciosBloqueados += 1;
    responder({ cancel: true });

    // La cuenta se refresca de a poco: si no, una pagina con cien anuncios
    // manda cien mensajes seguidos a la barra sin ningun motivo.
    if (navegador.anunciosBloqueados % 5 === 1) avisarEstado();
  });
}

/**
 * Le dice al navegador interno en que idioma pedir las paginas.
 *
 * Es la cabecera Accept-Language: la que hace que YouTube te salga en
 * castellano o en ingles. Por eso cambiar el idioma de Vexa cambia tambien el
 * de los sitios que abris.
 */
function aplicarIdiomaAlNavegador() {
  if (!vista || vista.webContents.isDestroyed()) return;
  const comoPide = idiomas.comoPideLasPaginas(ajustes.idioma);
  vista.webContents.session.setUserAgent(AGENTE_DE_USUARIO, comoPide);
  console.log(`[vexa] El navegador pide las paginas asi: ${comoPide}`);
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
  aplicarIdiomaAlNavegador();

  // Se puede apagar con VEXA_SIN_BLOQUEO=1, para medir cuanto cuesta.
  if (process.env.VEXA_SIN_BLOQUEO !== '1') bloquearAnuncios(contenido.session);

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

  // YouTube es una sola pagina que se va reescribiendo, asi que el guion se
  // instala al cargar el documento y despues sigue vivo por su cuenta.
  contenido.on('dom-ready', () => inyectarSalteadorDeAnuncios(contenido));

  // Solo miramos el marco que acaba de cargar, no todos los de la pagina: en
  // un sitio con muchos iframes, recorrerlos enteros en cada carga se nota.
  contenido.on('did-frame-finish-load', (_evento, esPrincipal, idProceso, idRuteo) => {
    if (esPrincipal) return; // el principal ya lo cubre dom-ready
    const marco = webFrameMain.fromId(idProceso, idRuteo);
    if (!marco || !esYoutube(marco.url)) return;
    inyectarEnUnMarco(marco);
  });
  contenido.on('did-navigate', () => {
    // Cada pagina lleva su propia cuenta de bloqueos.
    navegador.anunciosBloqueados = 0;
    navegador.popupsBloqueados = 0;
    navegador.ultimoPopupBloqueado = '';
    avisarEstado();
  });
  contenido.on('did-navigate-in-page', avisarEstado);

  contenido.on('page-title-updated', () => {
    actualizarTitulo();
    avisarEstado();
  });

  contenido.on('did-fail-load', (_evento, codigo, descripcion, urlFallida, esPrincipal) => {
    // -3 es ERR_ABORTED: la carga se cancelo sola (por ejemplo, otra navegacion).
    if (!esPrincipal || codigo === -3) return;
    console.error(`[vexa] No cargo ${urlFallida} (${codigo}: ${descripcion})`);
    navegador.hayPagina = false;
    actualizarVista();
    avisarBarra('vexa:error-de-carga', {
      url: urlFallida || navegador.ultimaUrlPedida,
      codigo,
      descripcion,
    });
  });

  contenido.on('render-process-gone', (_evento, detalles) => {
    console.error(`[vexa] El navegador interno se cayo: ${detalles.reason}`);
    navegador.hayPagina = false;
    actualizarVista();
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

/**
 * Repite dentro del navegador un mando que mando el espectador.
 * Todo lo que llega es de otra computadora: se valida antes de hacerle caso.
 *
 * @returns {boolean} si el mando se aplico.
 */
function aplicarMando(mensaje) {
  if (navegador.modo !== 'anfitrion' || !navegador.controlCedido) {
    // Llego un mando sin permiso. Puede ser un mensaje viejo todavia en camino.
    return false;
  }

  if (!vista || vista.webContents.isDestroyed()) return false;

  const { width, height } = vista.getBounds();
  const traducido = traducirEvento(mensaje, { ancho: width, alto: height });

  if (!traducido.ok) {
    console.warn(`[vexa] Mando descartado: ${traducido.motivo}`);
    return false;
  }

  for (const evento of traducido.eventos) {
    vista.webContents.sendInputEvent(evento);
  }
  return true;
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
  if (esEspectador() && atajo !== 'foco-barra') {
    avisarBarra('vexa:aviso', 'Estas mirando lo que abre tu amigo. Pedile el control para navegar.');
    return;
  }
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
// Captura para transmitirle al amigo
// ---------------------------------------------------------------------------

/**
 * Cuando la barra pide capturar la pantalla, Vexa no le ofrece un menu con
 * monitores y ventanas: le entrega directamente el navegador interno, con su
 * audio. No se transmite el escritorio, ni las otras ventanas, ni el audio del
 * resto de la computadora.
 */
function prepararCaptura() {
  ventana.webContents.session.setDisplayMediaRequestHandler((_solicitud, responder) => {
    if (!vista || vista.webContents.isDestroyed()) {
      console.error('[vexa] Se pidio transmitir, pero el navegador interno no esta listo.');
      // Un objeto vacio hace que getDisplayMedia falle, que es lo correcto aca.
      responder({});
      return;
    }

    console.log('[vexa] Entregando el navegador interno para transmitir.');
    responder({
      video: vista.webContents.mainFrame,
      audio: vista.webContents.mainFrame,
      // Asi vos seguis escuchando la peli mientras se la mandas a tu amigo.
      enableLocalEcho: true,
    });
  });
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
    if (PROBAR_PANEL) {
      correrPruebaEnLaVentana('prueba-panel.js', 'Pantalla');
      return;
    }
    if (MODO_HUMO && URL_DE_HUMO === '') {
      console.log('[vexa] VEXA_SMOKE=1: cierro la ventana y salgo.');
      app.quit();
    }
  });

  prepararCaptura();

  if (MODO_HUMO) {
    // Sin esto, un error de la pantalla no se ve por ningun lado.
    ventana.webContents.on('console-message', (...argumentos) => {
      // La forma de este evento cambio entre versiones de Electron, asi que
      // imprimimos lo que venga en vez de suponer.
      const partes = argumentos.slice(1).map((a) => {
        if (a === null || a === undefined) return '';
        if (typeof a === 'object') {
          return JSON.stringify({ level: a.level, message: a.message, line: a.lineNumber, source: a.sourceId });
        }
        return String(a);
      });
      const texto = partes.join(' | ');
      if (texto.includes('[panel]') || texto.includes('[prueba]')) return;
      if (/Uncaught|is not defined|is not a function/.test(texto)) {
        erroresDeLaPantalla.push(texto);
      }
      console.log(`[pantalla] ${texto}`);
    });
  }

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
  const arranque = Date.now();

  const reloj = setTimeout(() => {
    console.error(`[vexa] La prueba tardo mas de ${ESPERA_MAXIMA_DE_HUMO} ms y se corta.`);
    app.exit(1);
  }, ESPERA_MAXIMA_DE_HUMO);

  contenido.once('did-finish-load', () => {
    clearTimeout(reloj);
    console.log(`[vexa] Pagina cargada en ${Date.now() - arranque} ms: "${contenido.getTitle()}"`);
    console.log(`[vexa] Navegador visible: ${vistaDebeVerse()}`);
    if (PROBAR_SESION) probarSesion();
    else if (PROBAR_CONTROL) probarControl();
    else if (PROBAR_ANUNCIOS) probarAnuncios();
    else app.quit();
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

/**
 * Prueba en vivo de la sesion compartida: corre test/prueba-sesion-en-vivo.js
 * dentro de la ventana, que arma las dos puntas de la conexion y comprueba que
 * llegue video. Sale con 0 si llego y con 1 si no.
 */
/**
 * Corre una de las pruebas de test/ dentro de la ventana y sale segun el
 * resultado. Las pruebas devuelven {ok, pasos, motivo}.
 */
function correrPruebaEnLaVentana(archivo, nombre) {
  const guion = path.join(__dirname, 'test', archivo);
  let codigo;

  try {
    codigo = require('node:fs').readFileSync(guion, 'utf8');
  } catch (error) {
    console.error(`[vexa] No se encontro ${archivo}: ${error.message}`);
    app.exit(1);
    return;
  }

  console.log(`[vexa] Probando: ${nombre}…`);

  ventana.webContents
    .executeJavaScript(codigo, true)
    .then((resultado) => {
      for (const paso of resultado.pasos) console.log(`[vexa]   ${paso}`);

      if (erroresDeLaPantalla.length > 0) {
        console.error(`[vexa] ${nombre}: la pantalla tiro ${erroresDeLaPantalla.length} error(es):`);
        for (const error of erroresDeLaPantalla) console.error(`[vexa]   ${error}`);
        app.exit(1);
        return;
      }

      if (resultado.ok) {
        console.log(`[vexa] ${nombre}: anduvo.`);
        app.quit();
      } else {
        console.error(`[vexa] ${nombre}: fallo (${resultado.motivo}).`);
        app.exit(1);
      }
    })
    .catch((error) => {
      console.error(`[vexa] La prueba de ${nombre} reventó: ${error.message}`);
      app.exit(1);
    });
}

function probarSesion() {
  correrPruebaEnLaVentana('prueba-sesion-en-vivo.js', 'Sesion compartida');
}

/**
 * Prueba del traspaso de control: hace de cuenta que el amigo tiene el control
 * y manda un clic y una tecla. La pagina de prueba escribe en su titulo lo que
 * recibe, asi se puede comprobar desde aca que llego.
 */
function probarControl() {
  const contenido = vista.webContents;
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

  (async () => {
    // 1. Sin permiso, un mando no tiene que hacer nada.
    navegador.modo = 'solo';
    navegador.controlCedido = false;
    const sinPermiso = aplicarMando({ tipo: 'raton', accion: 'abajo', x: 0.5, y: 0.5 });
    console.log(`[vexa]   mando sin permiso: ${sinPermiso ? 'SE APLICO (mal)' : 'rechazado'}`);
    if (sinPermiso) throw new Error('un mando sin permiso llego a la pagina');

    // 2. Con el control cedido, un clic tiene que llegar.
    navegador.modo = 'anfitrion';
    navegador.controlCedido = true;
    // sendInputEvent necesita que la ventana tenga el foco del sistema.
    ventana.focus();
    contenido.focus();
    await esperar(300);

    aplicarMando({ tipo: 'raton', accion: 'abajo', x: 0.5, y: 0.5, boton: 'left', clics: 1 });
    aplicarMando({ tipo: 'raton', accion: 'arriba', x: 0.5, y: 0.5, boton: 'left' });
    await esperar(700);
    const trasElClic = contenido.getTitle();
    console.log(`[vexa]   despues del clic, el titulo dice: "${trasElClic}"`);
    if (!trasElClic.includes('clic')) throw new Error('el clic no llego a la pagina');

    // 3. Y una tecla tambien.
    aplicarMando({ tipo: 'tecla', accion: 'abajo', tecla: 'k' });
    aplicarMando({ tipo: 'tecla', accion: 'arriba', tecla: 'k' });
    await esperar(700);
    const trasLaTecla = contenido.getTitle();
    console.log(`[vexa]   despues de la tecla, el titulo dice: "${trasLaTecla}"`);
    if (!trasLaTecla.includes('tecla-k')) throw new Error('la tecla no llego a la pagina');

    // 4. Al recuperar el control, los mandos vuelven a rebotar.
    navegador.controlCedido = false;
    const trasRecuperar = aplicarMando({ tipo: 'raton', accion: 'abajo', x: 0.5, y: 0.5 });
    console.log(`[vexa]   mando tras recuperar el control: ${trasRecuperar ? 'SE APLICO (mal)' : 'rechazado'}`);
    if (trasRecuperar) throw new Error('el control recuperado sigue aceptando mandos');

    console.log('[vexa] Traspaso de control: anduvo.');
    app.quit();
  })().catch((error) => {
    console.error(`[vexa] Traspaso de control: fallo (${error.message}).`);
    app.exit(1);
  });
}

/**
 * Prueba del bloqueo: la pagina de prueba pide un recurso propio y varios de
 * redes de publicidad, y anota cuales le llegaron.
 */
function probarAnuncios() {
  const contenido = vista.webContents;

  setTimeout(() => {
    contenido
      .executeJavaScript('JSON.stringify(window.__resultado || {})')
      .then((crudo) => {
        const resultado = JSON.parse(crudo);
        console.log(`[vexa]   la pagina recibio: ${JSON.stringify(resultado.llegaron)}`);
        console.log(`[vexa]   la pagina no recibio: ${JSON.stringify(resultado.faltaron)}`);
        console.log(`[vexa]   anuncios bloqueados: ${navegador.anunciosBloqueados}`);

        const faltaron = resultado.faltaron ?? [];
        const llegaron = resultado.llegaron ?? [];

        if (!llegaron.includes('propio')) {
          throw new Error('se bloqueo un recurso de la propia pagina');
        }
        for (const anuncio of ['popads', 'doubleclick', 'taboola']) {
          if (!faltaron.includes(anuncio)) throw new Error(`no se bloqueo ${anuncio}`);
        }

        console.log('[vexa] Bloqueo de anuncios: anduvo.');
        app.quit();
      })
      .catch((error) => {
        console.error(`[vexa] Bloqueo de anuncios: fallo (${error.message}).`);
        app.exit(1);
      });
  }, 3000);
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
  if (esEspectador()) {
    return { ok: false, motivo: 'Estas mirando lo que abre tu amigo. Pedile el control para navegar.' };
  }
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

// --- Sesion compartida ---

ipcMain.handle('vexa:config-ice', () => ({ iceServers: [...sesion.SERVIDORES_ICE] }));

/** Ajustes que la interfaz necesita conocer. */
ipcMain.handle('vexa:ajustes', () => ({
  servidor: ajustes.servidor,
  idioma: ajustes.idioma,
  aviso: ajustes.aviso,
  idiomasDisponibles: idiomas.listar(),
}));

/** Todos los textos de un idioma, para que la pantalla se dibuje sola. */
ipcMain.handle('vexa:textos', (_evento, idioma) => ({
  idioma: idiomas.normalizar(idioma ?? ajustes.idioma),
  textos: idiomas.TEXTOS[idiomas.normalizar(idioma ?? ajustes.idioma)],
  // El castellano va siempre, como respaldo de cualquier hueco.
  respaldo: idiomas.TEXTOS[idiomas.POR_DEFECTO],
}));

ipcMain.handle('vexa:guardar-ajustes', (_evento, nuevos) => {
  const revisado = config.validarServidor(nuevos?.servidor ?? ajustes.servidor);
  if (!revisado.ok) return revisado;

  const idioma = idiomas.normalizar(nuevos?.idioma ?? ajustes.idioma);
  const cambioElIdioma = idioma !== ajustes.idioma;

  const guardado = config.guardar(rutaDeConfig(), { servidor: revisado.servidor, idioma });
  if (!guardado.ok) return { ok: false, motivo: guardado.motivo };

  ajustes = { servidor: revisado.servidor, idioma, aviso: '' };
  console.log(`[vexa] Servidor de encuentro: ${ajustes.servidor || '(sin configurar)'}`);

  if (cambioElIdioma) {
    aplicarIdiomaAlNavegador();
    // La pagina abierta se recarga sola, asi se ve en el idioma nuevo.
    if (vista && !vista.webContents.isDestroyed() && navegador.hayPagina) {
      vista.webContents.reload();
    }
  }

  return { ok: true, servidor: ajustes.servidor, idioma };
});

/** Comprueba que el servidor este vivo (y lo despierta si estaba dormido). */
ipcMain.handle('vexa:probar-servidor', (_evento, direccion) =>
  sesion.probarServidor(direccion || ajustes.servidor));

/** Crea la sala en el servidor y devuelve el codigo para pasarle al amigo. */
ipcMain.handle('vexa:crear-sala', (_evento, oferta, codigoPedido) =>
  sesion.crearSala(ajustes.servidor, oferta, codigoPedido));

/** Busca la invitacion de una sala para entrar. */
ipcMain.handle('vexa:buscar-sala', (_evento, codigo) =>
  sesion.buscarSala(ajustes.servidor, codigo));

/** Deja la respuesta del espectador en la sala. */
ipcMain.handle('vexa:contestar-sala', (_evento, codigo, respuesta) =>
  sesion.contestarSala(ajustes.servidor, codigo, respuesta));

/** El anfitrion pregunta si su amigo ya entro. */
ipcMain.handle('vexa:mirar-respuesta', (_evento, codigo) =>
  sesion.mirarRespuesta(ajustes.servidor, codigo));

/** Cancela una sala que quedo abierta. */
ipcMain.handle('vexa:cerrar-sala', (_evento, codigo) =>
  sesion.cerrarSala(ajustes.servidor, codigo));

ipcMain.handle('vexa:copiar', (_evento, texto) => {
  if (typeof texto !== 'string' || texto === '') {
    return { ok: false, motivo: 'No hay nada para copiar.' };
  }
  clipboard.writeText(texto);
  return { ok: true };
});

/** Cambia el modo: 'solo', 'anfitrion' (transmitis) o 'espectador' (mirás). */
ipcMain.on('vexa:modo', (_evento, modo) => {
  if (!['solo', 'anfitrion', 'espectador'].includes(modo)) {
    console.warn(`[vexa] Modo de sesion desconocido: ${modo}`);
    return;
  }
  navegador.modo = modo;
  // Al cambiar de modo el control siempre vuelve a cero.
  navegador.controlCedido = false;
  console.log(`[vexa] Modo de sesion: ${modo}`);
  actualizarVista();
});

/** Abre o cierra el panel de "ver juntos", que tapa el navegador mientras esta. */
ipcMain.on('vexa:panel', (_evento, abierto) => {
  navegador.panelAbierto = Boolean(abierto);
  actualizarVista();
});

// --- Control del navegador desde la otra computadora ---

/**
 * Presta o recupera el control del navegador. Solo el anfitrion decide esto:
 * el espectador no puede tomarlo por su cuenta.
 */
ipcMain.on('vexa:ceder-control', (_evento, cedido) => {
  if (navegador.modo !== 'anfitrion') {
    console.warn('[vexa] Se pidio ceder el control sin estar transmitiendo.');
    return;
  }

  navegador.controlCedido = Boolean(cedido);
  console.log(`[vexa] Control ${navegador.controlCedido ? 'cedido al amigo' : 'recuperado'}.`);

  // Para que las teclas lleguen a la pagina, la vista tiene que tener el foco.
  if (navegador.controlCedido && vista && !vista.webContents.isDestroyed()) {
    vista.webContents.focus();
  }

  actualizarVista();
});

/**
 * Repite dentro del navegador un mando que mando el espectador.
 * Todo lo que llega es de otra computadora: se valida antes de hacerle caso.
 */
ipcMain.on('vexa:mando', (_evento, mensaje) => aplicarMando(mensaje));

/** El espectador con control pidio abrir una direccion. */
ipcMain.on('vexa:navegar-remoto', (_evento, texto) => {
  if (navegador.modo !== 'anfitrion' || !navegador.controlCedido) return;

  const resultado = interpretarEntrada(texto);
  if (!resultado.ok) {
    avisarBarra('vexa:aviso', `Tu amigo quiso navegar, pero: ${resultado.motivo}`);
    return;
  }

  console.log(`[vexa] Tu amigo abrio: ${resultado.url}`);
  irA(resultado.url);
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

  app.whenReady().then(() => {
    ajustes = config.leer(rutaDeConfig());
    // Util para probar contra un servidor local sin tocar la configuracion.
    if (process.env.VEXA_SERVIDOR) {
      const forzado = config.validarServidor(process.env.VEXA_SERVIDOR);
      if (forzado.ok) ajustes = { servidor: forzado.servidor, aviso: '' };
      else console.warn(`[vexa] Se ignoro VEXA_SERVIDOR: ${forzado.motivo}`);
    }
    if (ajustes.aviso !== '') console.warn(`[vexa] ${ajustes.aviso}`);
    console.log(`[vexa] Servidor de encuentro: ${ajustes.servidor || '(sin configurar)'}`);
    crearVentana();
  }).catch((error) => {
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
