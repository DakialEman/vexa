'use strict';

// Vexa — logica de la barra de navegacion.
// Solo habla con el proceso principal a traves de window.vexa (ver preload.js).

const elementos = {
  atras: document.getElementById('boton-atras'),
  adelante: document.getElementById('boton-adelante'),
  recargar: document.getElementById('boton-recargar'),
  iconoRecargar: document.getElementById('icono-recargar'),
  inicio: document.getElementById('boton-inicio'),
  entrada: document.getElementById('entrada'),
  insignia: document.getElementById('insignia-bloqueados'),
  cuentaBloqueados: document.getElementById('cuenta-bloqueados'),
  pantallaInicio: document.getElementById('pantalla-inicio'),
  pantallaError: document.getElementById('pantalla-error'),
  errorDetalle: document.getElementById('error-detalle'),
  errorUrl: document.getElementById('error-url'),
  reintentar: document.getElementById('boton-reintentar'),
  volver: document.getElementById('boton-volver'),
  lineaVersion: document.getElementById('linea-version'),
  aviso: document.getElementById('aviso'),

  // Panel de sesion
  botonSesion: document.getElementById('boton-sesion'),
  pantallaSesion: document.getElementById('pantalla-sesion'),
  elegir: document.getElementById('sesion-elegir'),
  bloqueAnfitrion: document.getElementById('sesion-anfitrion'),
  bloqueEspectador: document.getElementById('sesion-espectador'),
  botonInvitar: document.getElementById('boton-invitar'),
  botonUnirme: document.getElementById('boton-unirme'),
  codigoInvitacion: document.getElementById('codigo-invitacion'),
  botonCopiarInvitacion: document.getElementById('boton-copiar-invitacion'),
  respuestaRecibida: document.getElementById('respuesta-recibida'),
  botonConectar: document.getElementById('boton-conectar'),
  invitacionRecibida: document.getElementById('invitacion-recibida'),
  botonResponder: document.getElementById('boton-responder'),
  pasoRespuesta: document.getElementById('paso-respuesta'),
  codigoRespuesta: document.getElementById('codigo-respuesta'),
  botonCopiarRespuesta: document.getElementById('boton-copiar-respuesta'),
  botonCortar: document.getElementById('boton-cortar'),
  estadoSesion: document.getElementById('estado-sesion'),
  estadoSesionTexto: document.getElementById('estado-sesion-texto'),
  videoRemoto: document.getElementById('video-remoto'),
  botonControl: document.getElementById('boton-control'),
  textoControl: document.getElementById('texto-control'),
};

// Como se lee en pantalla cada estado de la conexion con el amigo.
const ESTADOS = {
  new: { texto: 'Sin conexion.', tono: 'neutro' },
  connecting: { texto: 'Conectando con tu amigo…', tono: 'trabajando' },
  connected: { texto: 'Conectados.', tono: 'ok' },
  disconnected: { texto: 'Se corto la conexion. Reintentando…', tono: 'trabajando' },
  failed: { texto: 'No se pudo conectar. Prueben de nuevo con codigos nuevos.', tono: 'error' },
  closed: { texto: 'Sin conexion.', tono: 'neutro' },
  desconocido: { texto: 'Estado desconocido.', tono: 'neutro' },
};

// Dibujos del boton central: recargar cuando esta quieto, cruz cuando carga.
const DIBUJO_RECARGAR = 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5';
const DIBUJO_DETENER = 'M18 6 6 18M6 6l12 12';

// Mientras el usuario escribe no le pisamos la barra con la URL de la pagina.
let editandoBarra = false;
let temporizadorAviso = 0;

// Que pantalla de Vexa se ve cuando el navegador interno no esta tapando.
let pantallaElegida = 'inicio';

// La sesion compartida con el amigo (ver conexion.js).
let sesion = null;

// De anfitrion: si le prestaste el control. De espectador: si lo tenes.
let control = false;

function mostrarAviso(texto) {
  elementos.aviso.textContent = texto;
  elementos.aviso.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => elementos.aviso.classList.remove('visible'), 4000);
}

/** Elige que pantalla de Vexa se ve detras del navegador: inicio, error o sesion. */
function mostrarPantalla(cual) {
  pantallaElegida = cual;
  elementos.pantallaInicio.classList.toggle('visible', cual === 'inicio');
  elementos.pantallaError.classList.toggle('visible', cual === 'error');
  elementos.pantallaSesion.classList.toggle('visible', cual === 'sesion');
  // El navegador interno es una capa nativa: para ver el panel hay que taparlo.
  window.vexa.panel(cual === 'sesion');
}

function pintarEstado(estado) {
  elementos.atras.disabled = !estado.puedeAtras;
  elementos.adelante.disabled = !estado.puedeAdelante;

  elementos.iconoRecargar.firstElementChild.setAttribute(
    'd',
    estado.cargando ? DIBUJO_DETENER : DIBUJO_RECARGAR,
  );
  elementos.recargar.title = estado.cargando ? 'Detener (Esc)' : 'Recargar (F5)';

  if (!editandoBarra) {
    elementos.entrada.value = estado.visible ? estado.url : '';
  }

  elementos.cuentaBloqueados.textContent = String(estado.popupsBloqueados);
  elementos.insignia.classList.toggle('visible', estado.popupsBloqueados > 0);
  elementos.insignia.disabled = !estado.hayPopupBloqueado;

  // Si el navegador esta visible tapa todo; si no, se ve la pantalla elegida.
  const tapado = estado.visible;
  elementos.pantallaInicio.classList.toggle('visible', !tapado && pantallaElegida === 'inicio');
  elementos.pantallaError.classList.toggle('visible', !tapado && pantallaElegida === 'error');
  elementos.pantallaSesion.classList.toggle('visible', !tapado && pantallaElegida === 'sesion');

  // De espectador solo se navega si te prestaron el control.
  const mirando = estado.modo === 'espectador';
  const bloqueado = mirando && !control;
  elementos.entrada.readOnly = bloqueado;
  elementos.entrada.placeholder = bloqueado
    ? 'Estás mirando lo que abre tu amigo'
    : 'Buscá algo o escribí una dirección';
  for (const boton of [elementos.atras, elementos.adelante, elementos.recargar, elementos.inicio]) {
    if (mirando) boton.disabled = true;
  }
}

/** Pinta el boton de control segun quien lo tiene. */
function pintarControl({ conectado, papel }) {
  elementos.botonControl.classList.toggle('visible', conectado);
  elementos.botonControl.classList.toggle('cedido', control);
  elementos.botonControl.disabled = papel !== 'anfitrion';

  if (papel === 'anfitrion') {
    elementos.textoControl.textContent = control ? 'Quitar control' : 'Dar control';
    elementos.botonControl.title = control
      ? 'Tu amigo esta manejando tu navegador. Clic para recuperarlo.'
      : 'Pasarle el control de tu navegador a tu amigo.';
  } else {
    elementos.textoControl.textContent = control ? 'Tenés el control' : 'Mirando';
    elementos.botonControl.title = control
      ? 'Podes manejar el navegador de tu amigo.'
      : 'Tu amigo tiene el control.';
  }

  elementos.videoRemoto.classList.toggle('con-control', control && papel === 'espectador');
}

async function navegar() {
  const texto = elementos.entrada.value;

  // De espectador con control, la direccion se la pedimos al anfitrion.
  if (sesion && sesion.papel === 'espectador') {
    if (!control) {
      mostrarAviso('Pedile el control a tu amigo para poder navegar.');
      return;
    }
    if (!sesion.enviar({ tipo: 'navegar', texto })) {
      mostrarAviso('No se pudo mandar el pedido: la conexion no esta lista.');
    }
    elementos.entrada.blur();
    return;
  }

  try {
    const resultado = await window.vexa.navegar(texto);
    if (!resultado.ok) {
      mostrarAviso(resultado.motivo);
      return;
    }
    editandoBarra = false;
    elementos.entrada.blur();
  } catch (error) {
    mostrarAviso(`No se pudo navegar: ${error.message}`);
  }
}

function conectarBotones() {
  elementos.atras.addEventListener('click', () => window.vexa.atras());
  elementos.adelante.addEventListener('click', () => window.vexa.adelante());
  elementos.inicio.addEventListener('click', () => {
    mostrarPantalla('inicio');
    window.vexa.inicio();
  });

  elementos.recargar.addEventListener('click', () => {
    const cargando = elementos.iconoRecargar.firstElementChild.getAttribute('d') === DIBUJO_DETENER;
    if (cargando) window.vexa.detener();
    else window.vexa.recargar();
  });

  elementos.insignia.addEventListener('click', () => window.vexa.abrirPopupBloqueado());
  elementos.reintentar.addEventListener('click', () => window.vexa.reintentar());
  elementos.volver.addEventListener('click', () => {
    mostrarPantalla('inicio');
    window.vexa.inicio();
  });

  elementos.entrada.addEventListener('focus', () => {
    editandoBarra = true;
    elementos.entrada.select();
  });

  elementos.entrada.addEventListener('blur', () => {
    editandoBarra = false;
    refrescarEstado();
  });

  elementos.entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      navegar();
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      elementos.entrada.blur();
    }
  });

  // Ctrl+L lleva el foco a la barra, como en cualquier navegador.
  document.addEventListener('keydown', (evento) => {
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'l') {
      evento.preventDefault();
      elementos.entrada.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Sesion compartida con el amigo
// ---------------------------------------------------------------------------

/** Pinta el estado de la conexion y el puntito de la barra. */
function pintarEstadoSesion(estado) {
  const { texto, tono } = ESTADOS[estado] ?? ESTADOS.desconocido;
  elementos.estadoSesionTexto.textContent = texto;
  elementos.estadoSesion.className = `estado-sesion ${tono}`;
  elementos.botonSesion.classList.toggle('conectado', estado === 'connected');
  elementos.botonSesion.classList.toggle('trabajando', estado === 'connecting' || estado === 'disconnected');

  // Al cortarse la conexion el control vuelve a su dueño, sin excepciones.
  if (estado !== 'connected') control = false;
  pintarControl({ conectado: estado === 'connected', papel: sesion.papel });

  if (estado === 'connected' && sesion.papel === 'espectador') {
    // Ya llega el video: nos salimos del panel para verlo en grande.
    mostrarPantalla('ninguna');
  }
}

/** Muestra u oculta el video que manda el amigo. */
function pintarVideo(stream) {
  elementos.videoRemoto.srcObject = stream;
  elementos.videoRemoto.classList.toggle('visible', stream !== null);

  if (stream) {
    elementos.videoRemoto.play().catch((error) => {
      mostrarAviso(`No se pudo reproducir el video: ${error.message}`);
    });
  }
}

/** Corre una accion de la sesion mostrando el error si algo sale mal. */
async function intentar(boton, textoMientras, accion) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoMientras;
  try {
    await accion();
  } catch (error) {
    mostrarAviso(error.message);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

function abrirPanelSesion() {
  mostrarPantalla('sesion');
}

/** Deja el panel como al principio, listo para empezar de nuevo. */
function reiniciarPanel() {
  elementos.elegir.hidden = false;
  elementos.bloqueAnfitrion.hidden = true;
  elementos.bloqueEspectador.hidden = true;
  elementos.pasoRespuesta.hidden = true;
  elementos.codigoInvitacion.value = '';
  elementos.codigoRespuesta.value = '';
  elementos.respuestaRecibida.value = '';
  elementos.invitacionRecibida.value = '';
}

async function copiar(boton, texto) {
  if (!texto) {
    mostrarAviso('Todavia no hay codigo para copiar.');
    return;
  }
  const copiado = await window.vexa.copiar(texto);
  if (copiado.ok) mostrarAviso('Codigo copiado. Pasaselo a tu amigo.');
  else mostrarAviso(copiado.motivo);
}

/**
 * Mensajes que llegan por la conexion. Vienen de la computadora del otro, asi
 * que nada se toma como cierto sin mirarlo: cada caso valida lo suyo, y el
 * anfitrion vuelve a validar los mandos antes de repetirlos (src/control.js).
 */
function recibirMensaje(mensaje) {
  if (mensaje === null || typeof mensaje !== 'object') return;

  switch (mensaje.tipo) {
    // El anfitrion aviso que presto o recupero el control.
    case 'control': {
      if (sesion.papel !== 'espectador') return;
      control = Boolean(mensaje.cedido);
      pintarControl({ conectado: true, papel: 'espectador' });
      mostrarAviso(control ? 'Te pasaron el control.' : 'Tu amigo recupero el control.');
      refrescarEstado();
      break;
    }

    // El espectador con control quiere abrir una direccion.
    case 'navegar': {
      if (sesion.papel !== 'anfitrion' || !control) return;
      window.vexa.navegarRemoto(mensaje.texto);
      break;
    }

    // Un mando de mouse o teclado del espectador.
    case 'raton':
    case 'tecla': {
      if (sesion.papel !== 'anfitrion' || !control) return;
      window.vexa.mando(mensaje);
      break;
    }

    default:
      console.warn(`[vexa] Mensaje desconocido por la conexion: ${String(mensaje.tipo)}`);
  }
}

function conectarSesion() {
  sesion = window.VexaConexion.crearSesion({
    alEstado: pintarEstadoSesion,
    alVideo: pintarVideo,
    alAviso: mostrarAviso,
    alMensaje: recibirMensaje,
  });

  // Cuando el espectador tiene el control, lo que hace sobre el video viaja.
  window.VexaMando.conectarMando(elementos.videoRemoto, {
    enviar: (mensaje) => sesion.enviar(mensaje),
    tengoControl: () => control && sesion.papel === 'espectador',
  });

  elementos.botonControl.addEventListener('click', () => {
    if (sesion.papel !== 'anfitrion') return;
    control = !control;
    window.vexa.cederControl(control);
    if (!sesion.enviar({ tipo: 'control', cedido: control })) {
      mostrarAviso('No se pudo avisarle a tu amigo: la conexion no esta lista.');
      control = !control;
      window.vexa.cederControl(control);
    } else {
      mostrarAviso(control ? 'Le pasaste el control a tu amigo.' : 'Recuperaste el control.');
    }
    pintarControl({ conectado: true, papel: 'anfitrion' });
  });

  elementos.botonSesion.addEventListener('click', abrirPanelSesion);

  elementos.botonInvitar.addEventListener('click', () => {
    intentar(elementos.botonInvitar, 'Preparando…', async () => {
      elementos.elegir.hidden = true;
      elementos.bloqueAnfitrion.hidden = false;
      window.vexa.modo('anfitrion');
      const codigo = await sesion.crearInvitacion();
      elementos.codigoInvitacion.value = codigo;
      await copiar(elementos.botonCopiarInvitacion, codigo);
    });
  });

  elementos.botonUnirme.addEventListener('click', () => {
    elementos.elegir.hidden = true;
    elementos.bloqueEspectador.hidden = false;
    elementos.invitacionRecibida.focus();
  });

  elementos.botonResponder.addEventListener('click', () => {
    intentar(elementos.botonResponder, 'Generando…', async () => {
      const codigo = await sesion.responderInvitacion(elementos.invitacionRecibida.value);
      window.vexa.modo('espectador');
      elementos.codigoRespuesta.value = codigo;
      elementos.pasoRespuesta.hidden = false;
      await copiar(elementos.botonCopiarRespuesta, codigo);
    });
  });

  elementos.botonConectar.addEventListener('click', () => {
    intentar(elementos.botonConectar, 'Conectando…', async () => {
      await sesion.aceptarRespuesta(elementos.respuestaRecibida.value);
    });
  });

  elementos.botonCopiarInvitacion.addEventListener('click', () => {
    copiar(elementos.botonCopiarInvitacion, elementos.codigoInvitacion.value);
  });

  elementos.botonCopiarRespuesta.addEventListener('click', () => {
    copiar(elementos.botonCopiarRespuesta, elementos.codigoRespuesta.value);
  });

  elementos.botonCortar.addEventListener('click', () => {
    sesion.cortar();
    control = false;
    window.vexa.modo('solo');
    reiniciarPanel();
    mostrarPantalla('inicio');
  });
}

function conectarAvisosDelPrincipal() {
  window.vexa.al('vexa:estado', pintarEstado);

  window.vexa.al('vexa:error-de-carga', (fallo) => {
    elementos.errorDetalle.textContent = fallo.codigo
      ? `${fallo.descripcion} (codigo ${fallo.codigo})`
      : fallo.descripcion;
    elementos.errorUrl.textContent = fallo.url || '(sin direccion)';
    mostrarPantalla('error');
  });

  window.vexa.al('vexa:aviso', mostrarAviso);

  window.vexa.al('vexa:foco-barra', () => elementos.entrada.focus());
}

async function refrescarEstado() {
  try {
    pintarEstado(await window.vexa.estado());
  } catch (error) {
    mostrarAviso(`No se pudo leer el estado del navegador: ${error.message}`);
  }
}

async function mostrarVersion() {
  try {
    const info = await window.vexa.info();
    elementos.lineaVersion.textContent = `Vexa ${info.version} · Chromium ${info.chromium}`;
  } catch (error) {
    elementos.lineaVersion.textContent = `No se pudo leer la version: ${error.message}`;
  }
}

/** Sin el puente del preload la interfaz no puede hacer nada: se avisa y se corta. */
function hayPuente() {
  if (window.vexa && typeof window.vexa.navegar === 'function') return true;
  document.body.textContent = 'Vexa no pudo iniciar: el puente con la aplicacion no cargo.';
  document.body.style.padding = '40px';
  return false;
}

if (hayPuente()) {
  conectarBotones();
  conectarSesion();
  conectarAvisosDelPrincipal();
  mostrarVersion();
  refrescarEstado();
}
