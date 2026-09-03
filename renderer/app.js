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
  cargando: document.getElementById('cargando'),

  // Panel de sesion
  botonSesion: document.getElementById('boton-sesion'),
  pantallaSesion: document.getElementById('pantalla-sesion'),
  elegir: document.getElementById('sesion-elegir'),
  bloqueAnfitrion: document.getElementById('sesion-anfitrion'),
  bloqueEspectador: document.getElementById('sesion-espectador'),
  botonAbrir: document.getElementById('boton-abrir'),
  botonEntrar: document.getElementById('boton-entrar'),
  codigoPropio: document.getElementById('codigo-propio'),
  codigoSala: document.getElementById('codigo-sala'),
  botonCopiarCodigo: document.getElementById('boton-copiar-codigo'),
  notaEspera: document.getElementById('nota-espera'),
  codigoParaEntrar: document.getElementById('codigo-para-entrar'),
  botonConectar: document.getElementById('boton-conectar'),
  botonCortar: document.getElementById('boton-cortar'),
  botonAjustes: document.getElementById('boton-ajustes'),
  bloqueAjustes: document.getElementById('bloque-ajustes'),
  campoServidor: document.getElementById('campo-servidor'),
  botonGuardarAjustes: document.getElementById('boton-guardar-ajustes'),
  botonProbarServidor: document.getElementById('boton-probar-servidor'),
  selectorIdioma: document.getElementById('selector-idioma'),
  estadoSesion: document.getElementById('estado-sesion'),
  estadoSesionTexto: document.getElementById('estado-sesion-texto'),
  videoRemoto: document.getElementById('video-remoto'),
  botonControl: document.getElementById('boton-control'),
  textoControl: document.getElementById('texto-control'),
};

// Cada estado de WebRTC, con su clave de texto y su color.
const ESTADOS = {
  new: { clave: 'estado.sinConexion', tono: 'neutro' },
  connecting: { clave: 'estado.conectando', tono: 'trabajando' },
  connected: { clave: 'estado.conectados', tono: 'ok' },
  disconnected: { clave: 'estado.corto', tono: 'trabajando' },
  failed: { clave: 'estado.fallo', tono: 'error' },
  closed: { clave: 'estado.cerrada', tono: 'neutro' },
  desconocido: { clave: 'estado.desconocido', tono: 'neutro' },
};

// --- Idioma ---

/** Textos del idioma actual, y el castellano como respaldo. */
let diccionario = { idioma: 'es', textos: {}, respaldo: {} };

/**
 * Busca un texto por su clave.
 *
 * @param {string} clave
 * @param {Record<string, string|number>} [datos] Reemplazos tipo {segundos}.
 */
function t(clave, datos) {
  const texto = diccionario.textos[clave] ?? diccionario.respaldo[clave] ?? clave;
  if (!datos) return texto;
  return texto.replace(/\{(\w+)\}/g, (entero, nombre) =>
    (Object.hasOwn(datos, nombre) ? String(datos[nombre]) : entero));
}

/**
 * Escribe en pantalla todos los textos marcados en el HTML.
 * `data-t` va al contenido, `data-t-ph` al placeholder, `data-t-title` al globo
 * de ayuda. Se puede volver a llamar cuando cambia el idioma.
 */
function pintarTextos() {
  for (const elemento of document.querySelectorAll('[data-t]')) {
    elemento.textContent = t(elemento.dataset.t);
  }
  for (const elemento of document.querySelectorAll('[data-t-ph]')) {
    elemento.placeholder = t(elemento.dataset.tPh);
  }
  for (const elemento of document.querySelectorAll('[data-t-title]')) {
    elemento.title = t(elemento.dataset.tTitle);
  }
  document.documentElement.lang = diccionario.idioma;
}

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

// El que mira puso el video en pantalla completa.
let enPantallaCompleta = false;

// De espectador: que pagina esta mirando el anfitrion, para poder mostrarsela.
let paginaDelAmigo = { url: '', titulo: '' };

// De anfitrion: lo ultimo que le contamos al espectador, para no repetirnos.
let ultimaPaginaAvisada = '';

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
  elementos.recargar.title = t(estado.cargando ? 'barra.detener' : 'barra.recargar');
  elementos.cargando.classList.toggle('visible', estado.cargando);

  if (!editandoBarra) {
    // El espectador no tiene navegador propio: en su barra va la pagina que
    // esta mirando, asi sabe donde esta parado.
    if (estado.modo === 'espectador') elementos.entrada.value = paginaDelAmigo.url;
    else elementos.entrada.value = estado.visible ? estado.url : '';
  }

  // El anfitrion le cuenta al espectador que pagina abrio.
  if (estado.modo === 'anfitrion' && sesion && estado.url !== ultimaPaginaAvisada) {
    if (sesion.enviar({ tipo: 'pagina', url: estado.url, titulo: estado.titulo })) {
      ultimaPaginaAvisada = estado.url;
    }
  }

  const bloqueados = estado.popupsBloqueados + estado.anunciosBloqueados;
  elementos.cuentaBloqueados.textContent = String(bloqueados);
  elementos.insignia.classList.toggle('visible', bloqueados > 0);
  elementos.insignia.disabled = !estado.hayPopupBloqueado;
  elementos.insignia.title = t('barra.bloqueadosAyuda');

  // Si el navegador esta visible tapa todo; si no, se ve la pantalla elegida.
  const tapado = estado.visible;
  elementos.pantallaInicio.classList.toggle('visible', !tapado && pantallaElegida === 'inicio');
  elementos.pantallaError.classList.toggle('visible', !tapado && pantallaElegida === 'error');
  elementos.pantallaSesion.classList.toggle('visible', !tapado && pantallaElegida === 'sesion');

  // De espectador solo se navega si te prestaron el control.
  const mirando = estado.modo === 'espectador';
  const bloqueado = mirando && !control;
  elementos.entrada.readOnly = bloqueado;
  elementos.entrada.placeholder = t(bloqueado ? 'barra.mirando' : 'barra.direccion');
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
    elementos.textoControl.textContent = t(control ? 'barra.quitarControl' : 'barra.darControl');
    elementos.botonControl.title = t(control ? 'barra.quitarControlAyuda' : 'barra.darControlAyuda');
  } else {
    elementos.textoControl.textContent = t(control ? 'barra.tenesControl' : 'barra.mirandoControl');
    elementos.botonControl.title = t(control ? 'barra.tenesControlAyuda' : 'barra.mirandoControlAyuda');
  }

  elementos.videoRemoto.classList.toggle('con-control', control && papel === 'espectador');
}

async function navegar() {
  const texto = elementos.entrada.value;

  // De espectador con control, la direccion se la pedimos al anfitrion.
  if (sesion && sesion.papel === 'espectador') {
    if (!control) {
      mostrarAviso(t('aviso.pedileControl'));
      return;
    }
    if (!sesion.enviar({ tipo: 'navegar', texto })) {
      mostrarAviso(t('aviso.sinConexionParaMandar'));
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

  document.addEventListener('keydown', (evento) => {
    // Ctrl+L lleva el foco a la barra, como en cualquier navegador.
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'l') {
      evento.preventDefault();
      elementos.entrada.focus();
      return;
    }

    // F11 entra y sale de pantalla completa; Esc solo sale.
    if (evento.key === 'F11') {
      evento.preventDefault();
      ponerPantallaCompleta(!enPantallaCompleta);
      return;
    }

    if (evento.key === 'Escape' && enPantallaCompleta) {
      evento.preventDefault();
      ponerPantallaCompleta(false);
    }
  });

  // Doble clic en el video: pantalla completa, como en cualquier reproductor.
  // Solo cuando NO tenes el control, porque si lo tenes ese doble clic le
  // pertenece a la pagina del otro.
  elementos.videoRemoto.addEventListener('dblclick', () => {
    if (control) return;
    ponerPantallaCompleta(!enPantallaCompleta);
  });
}

// ---------------------------------------------------------------------------
// Sesion compartida con el amigo
// ---------------------------------------------------------------------------

/** Escribe un texto en la linea de estado del panel, sin depender de WebRTC. */
function decirEstado(texto, tono) {
  elementos.estadoSesionTexto.textContent = texto;
  elementos.estadoSesion.className = `estado-sesion ${tono ?? 'neutro'}`;
}

/** Pinta el estado de la conexion y el puntito de la barra. */
function pintarEstadoSesion(estado) {
  const { clave, tono } = ESTADOS[estado] ?? ESTADOS.desconocido;
  elementos.estadoSesionTexto.textContent = t(clave);
  elementos.estadoSesion.className = `estado-sesion ${tono}`;
  elementos.botonSesion.classList.toggle('conectado', estado === 'connected');
  elementos.botonSesion.classList.toggle('trabajando', estado === 'connecting' || estado === 'disconnected');

  // Al cortarse la conexion el control vuelve a su dueño, sin excepciones.
  if (estado !== 'connected') control = false;
  pintarControl({ conectado: estado === 'connected', papel: sesion.papel });

  if (estado === 'connected') {
    // Ya estan conectados: el panel no hace falta mas.
    if (sesion.papel === 'espectador') mostrarPantalla('ninguna');
    else if (pantallaElegida === 'sesion') mostrarPantalla('inicio');

    // Y el anfitrion le cuenta enseguida que pagina esta mirando. Sin esto,
    // si no navegaba a ningun lado el espectador se quedaba sin saberlo.
    if (sesion.papel === 'anfitrion') {
      ultimaPaginaAvisada = '';
      refrescarEstado();
    }
  }

  // Si la conexion se murio de verdad, el que miraba no puede quedarse con un
  // video congelado y sin navegador: lo devolvemos a un Vexa usable.
  if (estado === 'failed') {
    window.vexa.modo('solo');
    control = false;
    paginaDelAmigo = { url: '', titulo: '' };
    ultimaPaginaAvisada = '';
    pintarVideo(null);
    reiniciarPanel();
    mostrarPantalla('sesion');
  }
}

/**
 * Pantalla completa para el que esta mirando.
 *
 * El anfitrion ya la tiene, porque se la da el reproductor de la pagina. El
 * espectador solo recibe un video, asi que la pantalla completa se la damos
 * nosotros: el video tapa tambien la barra.
 */
function ponerPantallaCompleta(completa) {
  // Solo tiene sentido cuando hay un video que mirar.
  if (completa && !elementos.videoRemoto.classList.contains('visible')) return;

  enPantallaCompleta = completa;
  elementos.videoRemoto.classList.toggle('completo', completa);
  document.body.classList.toggle('completo', completa);
  window.vexa.pantallaCompleta(completa);

  if (completa) mostrarAviso(t('aviso.comoSalirDeCompleta'));
}

/** Muestra u oculta el video que manda el amigo. */
function pintarVideo(stream) {
  elementos.videoRemoto.srcObject = stream;
  elementos.videoRemoto.classList.toggle('visible', stream !== null);

  // Sin video, la pantalla completa no tiene sentido: quedaria todo negro.
  if (stream === null && enPantallaCompleta) ponerPantallaCompleta(false);

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
/** Deja el panel como al principio, listo para empezar de nuevo. */
function reiniciarPanel() {
  elementos.elegir.hidden = false;
  elementos.bloqueAnfitrion.hidden = true;
  elementos.bloqueEspectador.hidden = true;
  elementos.codigoSala.textContent = '·····';
  elementos.codigoParaEntrar.value = '';
  elementos.notaEspera.textContent = t('sesion.esperando');
}

async function copiar(texto) {
  if (!texto) {
    mostrarAviso(t('aviso.nadaQueCopiar'));
    return;
  }
  const copiado = await window.vexa.copiar(texto);
  if (copiado.ok) mostrarAviso(t('aviso.codigoCopiado'));
  else mostrarAviso(copiado.motivo);
}

/** Muestra el codigo de sala partido al medio, que se lee mejor. */
function comoSeLee(codigo) {
  return codigo.length === 6 ? `${codigo.slice(0, 3)}-${codigo.slice(3)}` : codigo;
}

/** Antes de abrir o entrar, hay que tener servidor configurado. */
async function hayServidor() {
  const ajustes = await window.vexa.ajustes();
  if (ajustes.servidor !== '') return true;

  mostrarAviso(t('aviso.faltaServidor'));
  abrirAjustes(true);
  return false;
}

function abrirAjustes(abrir) {
  elementos.bloqueAjustes.hidden = !abrir;
  if (abrir) elementos.campoServidor.focus();
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
      mostrarAviso(t(control ? 'aviso.teDieronControl' : 'aviso.recuperoControl'));
      refrescarEstado();
      break;
    }

    // El anfitrion conto que pagina esta mirando.
    case 'pagina': {
      if (sesion.papel !== 'espectador') return;
      // Viene de la otra computadora: lo tratamos como texto y nada mas.
      paginaDelAmigo = {
        url: typeof mensaje.url === 'string' ? mensaje.url.slice(0, 2000) : '',
        titulo: typeof mensaje.titulo === 'string' ? mensaje.titulo.slice(0, 300) : '',
      };
      if (!editandoBarra) elementos.entrada.value = paginaDelAmigo.url;
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

  // Gancho para las pruebas: permite simular estados de la conexion sin
  // necesitar una segunda computadora. No hace nada en el uso normal.
  window.__vexaSesionDePrueba = {
    simularEstado: (estado) => pintarEstadoSesion(estado),
    simularEstadoDelNavegador: (estado) => pintarEstado(estado),
  };

  // Cuando el espectador tiene el control, lo que hace sobre el video viaja.
  window.VexaMando.conectarMando(elementos.videoRemoto, {
    enviar: (mensaje) => sesion.enviar(mensaje),
    tengoControl: () => control && sesion.papel === 'espectador',
  });

  elementos.botonSesion.addEventListener('click', abrirPanelSesion);

  // --- Anfitrion: abrir una sala ---
  elementos.botonAbrir.addEventListener('click', () => {
    intentar(elementos.botonAbrir, 'Abriendo…', async () => {
      if (!(await hayServidor())) return;

      elementos.elegir.hidden = true;
      elementos.bloqueAnfitrion.hidden = false;
      elementos.codigoSala.textContent = '·····';
      window.vexa.modo('anfitrion');

      // En los planes gratuitos el servidor se duerme y despertarlo tarda.
      // Mejor decirlo que dejar al usuario mirando puntitos.
      decirEstado(t('estado.hablandoServidor'), 'trabajando');
      elementos.notaEspera.textContent = t('sesion.puedeTardar');

      try {
        const codigo = await sesion.abrirSala(elementos.codigoPropio.value);
        elementos.codigoSala.textContent = comoSeLee(codigo);
        elementos.notaEspera.textContent = t('sesion.esperando');
        decirEstado(t('estado.salaAbierta'), 'ok');
        await copiar(comoSeLee(codigo));
      } catch (error) {
        // Si no se pudo abrir, volvemos atras en vez de dejar el panel a medias.
        elementos.elegir.hidden = false;
        elementos.bloqueAnfitrion.hidden = true;
        elementos.codigoSala.textContent = '·····';
        window.vexa.modo('solo');
        // El aviso flotante se va solo a los pocos segundos; en la linea de
        // estado el motivo queda, que es donde uno lo va a buscar.
        decirEstado(error.message, 'error');
        throw error;
      }
    });
  });

  // --- Espectador: entrar con un codigo ---
  elementos.botonEntrar.addEventListener('click', () => {
    elementos.elegir.hidden = true;
    elementos.bloqueEspectador.hidden = false;
    elementos.codigoParaEntrar.focus();
  });

  elementos.botonConectar.addEventListener('click', () => {
    intentar(elementos.botonConectar, 'Entrando…', async () => {
      if (!(await hayServidor())) return;

      decirEstado(t('estado.buscandoSala'), 'trabajando');

      try {
        await sesion.entrarASala(elementos.codigoParaEntrar.value);
        window.vexa.modo('espectador');
        decirEstado(t('estado.entraste'), 'trabajando');
      } catch (error) {
        decirEstado(error.message, 'error');
        throw error;
      }
    });
  });

  elementos.codigoParaEntrar.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') elementos.botonConectar.click();
  });

  elementos.botonCopiarCodigo.addEventListener('click', () => {
    copiar(elementos.codigoSala.textContent);
  });

  elementos.botonCortar.addEventListener('click', () => {
    sesion.cortar();
    control = false;
    paginaDelAmigo = { url: '', titulo: '' };
    ultimaPaginaAvisada = '';
    window.vexa.modo('solo');
    reiniciarPanel();
    mostrarPantalla('inicio');
  });

  // --- Ajustes ---
  elementos.botonAjustes.addEventListener('click', () => {
    abrirAjustes(elementos.bloqueAjustes.hidden);
  });

  elementos.botonProbarServidor.addEventListener('click', () => {
    intentar(elementos.botonProbarServidor, 'Probando…', async () => {
      const direccion = elementos.campoServidor.value.trim();
      if (direccion === '') {
        mostrarAviso(t('aviso.escribiServidor'));
        return;
      }

      decirEstado(t('estado.probandoServidor'), 'trabajando');
      const prueba = await window.vexa.probarServidor(direccion);

      if (prueba.ok) {
        decirEstado(t('estado.servidorAnda', { segundos: (prueba.demora / 1000).toFixed(1) }), 'ok');
      } else {
        decirEstado(prueba.motivo, 'error');
      }
    });
  });

  // El idioma se aplica al toque, sin apretar Guardar: se ve lo que elegiste.
  //
  // No usa `intentar` a proposito: esa funcion guarda el texto del boton para
  // devolverlo despues, y al cambiar el idioma ese texto guardado quedaria en
  // el idioma viejo, pisando la traduccion recien pintada.
  elementos.selectorIdioma.addEventListener('change', async () => {
    elementos.selectorIdioma.disabled = true;

    try {
      const guardado = await window.vexa.guardarAjustes({
        servidor: elementos.campoServidor.value,
        idioma: elementos.selectorIdioma.value,
      });

      if (!guardado.ok) {
        mostrarAviso(guardado.motivo);
        return;
      }

      await cargarIdioma(guardado.idioma);
      mostrarAviso(t('aviso.idiomaGuardado'));
    } catch (error) {
      mostrarAviso(error.message);
    } finally {
      elementos.selectorIdioma.disabled = false;
    }
  });

  elementos.botonGuardarAjustes.addEventListener('click', () => {
    intentar(elementos.botonGuardarAjustes, 'Guardando…', async () => {
      const guardado = await window.vexa.guardarAjustes({
        servidor: elementos.campoServidor.value,
        idioma: elementos.selectorIdioma.value,
      });
      if (!guardado.ok) {
        mostrarAviso(guardado.motivo);
        return;
      }
      elementos.campoServidor.value = guardado.servidor;
      mostrarAviso(t(guardado.servidor === '' ? 'aviso.servidorBorrado' : 'aviso.servidorGuardado'));
      abrirAjustes(false);
    });
  });

  elementos.botonControl.addEventListener('click', () => {
    if (sesion.papel !== 'anfitrion') return;
    control = !control;
    window.vexa.cederControl(control);
    if (!sesion.enviar({ tipo: 'control', cedido: control })) {
      mostrarAviso(t('aviso.noSePudoAvisar'));
      control = !control;
      window.vexa.cederControl(control);
    } else {
      mostrarAviso(t(control ? 'aviso.pasasteControl' : 'aviso.recuperasteControl'));
    }
    pintarControl({ conectado: true, papel: 'anfitrion' });
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

/** Trae los textos del idioma pedido y los pinta en toda la pantalla. */
async function cargarIdioma(idioma) {
  diccionario = await window.vexa.textos(idioma);
  pintarTextos();
  // Los textos que se arman a mano tambien tienen que seguir el idioma.
  refrescarEstado();
}

async function cargarAjustes() {
  try {
    const ajustes = await window.vexa.ajustes();
    elementos.campoServidor.value = ajustes.servidor;

    elementos.selectorIdioma.replaceChildren();
    for (const idioma of ajustes.idiomasDisponibles) {
      const opcion = document.createElement('option');
      opcion.value = idioma.codigo;
      opcion.textContent = idioma.nombre;
      elementos.selectorIdioma.append(opcion);
    }
    elementos.selectorIdioma.value = ajustes.idioma;

    await cargarIdioma(ajustes.idioma);

    if (ajustes.aviso !== '') mostrarAviso(ajustes.aviso);
  } catch (error) {
    mostrarAviso(`No se pudieron leer los ajustes: ${error.message}`);
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
  document.body.textContent = 'Vexa no pudo iniciar: el puente con la aplicacion no cargo.'; // sin idioma todavia
  document.body.style.padding = '40px';
  return false;
}

if (hayPuente()) {
  conectarBotones();
  conectarSesion();
  conectarAvisosDelPrincipal();
  cargarAjustes();
  mostrarVersion();
  refrescarEstado();
}
