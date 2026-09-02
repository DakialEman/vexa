'use strict';

// Vexa — puente entre el proceso principal y la barra de navegacion.
// La interfaz no ve Node ni Electron: solo lo que exponemos aca abajo.

const { contextBridge, ipcRenderer } = require('electron');

/** Canales que el proceso principal puede empujar hacia la interfaz. */
const CANALES_DE_ENTRADA = ['vexa:estado', 'vexa:error-de-carga', 'vexa:aviso', 'vexa:foco-barra'];

/**
 * Registra un oyente para un canal conocido.
 * @param {string} canal
 * @param {(datos: unknown) => void} alRecibir
 */
function escuchar(canal, alRecibir) {
  if (!CANALES_DE_ENTRADA.includes(canal)) {
    throw new Error(`Canal no permitido: ${canal}`);
  }
  ipcRenderer.on(canal, (_evento, datos) => alRecibir(datos));
}

contextBridge.exposeInMainWorld('vexa', {
  /** Nombre, version y versiones del entorno. */
  info: () => ipcRenderer.invoke('vexa:info'),

  /** Estado actual del navegador interno (url, titulo, si puede ir atras, etc). */
  estado: () => ipcRenderer.invoke('vexa:estado'),

  /**
   * Navega a lo que se escribio en la barra. Devuelve el resultado de
   * interpretarlo, asi la interfaz puede mostrar el motivo si no se pudo.
   */
  navegar: (texto) => ipcRenderer.invoke('vexa:navegar', texto),

  /** Acciones del navegador: atras, adelante, recargar, detener, inicio, etc. */
  atras: () => ipcRenderer.send('vexa:accion', 'atras'),
  adelante: () => ipcRenderer.send('vexa:accion', 'adelante'),
  recargar: () => ipcRenderer.send('vexa:accion', 'recargar'),
  detener: () => ipcRenderer.send('vexa:accion', 'detener'),
  inicio: () => ipcRenderer.send('vexa:accion', 'inicio'),
  reintentar: () => ipcRenderer.send('vexa:accion', 'reintentar'),
  abrirPopupBloqueado: () => ipcRenderer.send('vexa:accion', 'abrir-popup-bloqueado'),

  /** Cierra la ventana desde la interfaz. */
  cerrarVentana: () => ipcRenderer.send('vexa:cerrar'),

  /** Avisos que llegan desde el proceso principal. */
  al: escuchar,
});
