'use strict';

// Vexa — logica de la interfaz.
// Solo habla con el proceso principal a traves de window.vexa (ver preload.js).

const estado = document.getElementById('estado');
const estadoTexto = document.getElementById('estado-texto');
const botonCerrar = document.getElementById('boton-cerrar');

const CAMPOS = {
  version: document.getElementById('dato-version'),
  electron: document.getElementById('dato-electron'),
  chromium: document.getElementById('dato-chromium'),
  node: document.getElementById('dato-node'),
  plataforma: document.getElementById('dato-plataforma'),
};

function mostrarEstado(texto, tipo) {
  estadoTexto.textContent = texto;
  estado.className = tipo ? `estado ${tipo}` : 'estado';
}

/** Sin el puente del preload la interfaz no puede hacer nada: se avisa y se corta. */
function hayPuente() {
  if (window.vexa && typeof window.vexa.info === 'function') return true;
  mostrarEstado('No se pudo conectar con la app (preload no cargo).', 'error');
  botonCerrar.disabled = true;
  return false;
}

async function cargarInfo() {
  try {
    const info = await window.vexa.info();
    CAMPOS.version.textContent = info.version;
    CAMPOS.electron.textContent = info.electron;
    CAMPOS.chromium.textContent = info.chromium;
    CAMPOS.node.textContent = info.node;
    CAMPOS.plataforma.textContent = info.plataforma;
    mostrarEstado('Ventana lista.', 'ok');
  } catch (error) {
    mostrarEstado(`No se pudo leer la info de la app: ${error.message}`, 'error');
  }
}

botonCerrar.addEventListener('click', () => {
  if (!window.vexa) return;
  botonCerrar.disabled = true;
  mostrarEstado('Cerrando…', null);
  window.vexa.cerrarVentana();
});

if (hayPuente()) {
  cargarInfo();
}
