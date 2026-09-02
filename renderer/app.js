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
};

// Dibujos del boton central: recargar cuando esta quieto, cruz cuando carga.
const DIBUJO_RECARGAR = 'M21 12a9 9 0 1 1-3-6.7M21 4v5h-5';
const DIBUJO_DETENER = 'M18 6 6 18M6 6l12 12';

// Mientras el usuario escribe no le pisamos la barra con la URL de la pagina.
let editandoBarra = false;
let temporizadorAviso = 0;

function mostrarAviso(texto) {
  elementos.aviso.textContent = texto;
  elementos.aviso.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => elementos.aviso.classList.remove('visible'), 4000);
}

/** Elige que pantalla de Vexa se ve detras del navegador: inicio, error o ninguna. */
function mostrarPantalla(cual) {
  elementos.pantallaInicio.classList.toggle('visible', cual === 'inicio');
  elementos.pantallaError.classList.toggle('visible', cual === 'error');
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

  // Si el navegador esta visible, tapa todo: no hace falta pantalla de fondo.
  if (estado.visible) mostrarPantalla('ninguna');
  else if (!elementos.pantallaError.classList.contains('visible')) mostrarPantalla('inicio');
}

async function navegar() {
  const texto = elementos.entrada.value;
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
  conectarAvisosDelPrincipal();
  mostrarVersion();
  refrescarEstado();
}
