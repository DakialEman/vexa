'use strict';

// Vexa — puente entre el proceso principal y la interfaz.
// La interfaz no ve Node ni Electron: solo lo que exponemos aca abajo.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vexa', {
  /** Devuelve nombre, version y versiones del entorno para mostrarlas en pantalla. */
  info: () => ipcRenderer.invoke('vexa:info'),

  /** Cierra la ventana desde la interfaz. */
  cerrarVentana: () => ipcRenderer.send('vexa:cerrar'),
});
