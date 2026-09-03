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

  // --- Sesion compartida con el amigo ---

  /** Servidores STUN para armar la conexion. */
  configuracionIce: () => ipcRenderer.invoke('vexa:config-ice'),

  /** Ajustes del usuario (por ahora, la direccion del servidor). */
  ajustes: () => ipcRenderer.invoke('vexa:ajustes'),

  /** Todos los textos de la interfaz en un idioma. */
  textos: (idioma) => ipcRenderer.invoke('vexa:textos', idioma),
  guardarAjustes: (nuevos) => ipcRenderer.invoke('vexa:guardar-ajustes', nuevos),

  /** Comprueba que el servidor este vivo, y lo despierta si dormia. */
  probarServidor: (direccion) => ipcRenderer.invoke('vexa:probar-servidor', direccion),

  /** Abre una sala y devuelve el codigo corto para pasarle al amigo. */
  crearSala: (oferta, codigoPedido) => ipcRenderer.invoke('vexa:crear-sala', oferta, codigoPedido),

  /** Busca la invitacion de una sala para entrar. */
  buscarSala: (codigo) => ipcRenderer.invoke('vexa:buscar-sala', codigo),

  /** Deja la respuesta en la sala. */
  contestarSala: (codigo, respuesta) => ipcRenderer.invoke('vexa:contestar-sala', codigo, respuesta),

  /** Pregunta si el amigo ya entro a la sala. */
  mirarRespuesta: (codigo) => ipcRenderer.invoke('vexa:mirar-respuesta', codigo),

  /** Cancela una sala abierta. */
  cerrarSala: (codigo) => ipcRenderer.invoke('vexa:cerrar-sala', codigo),

  /** Copia texto al portapapeles. */
  copiar: (texto) => ipcRenderer.invoke('vexa:copiar', texto),

  /** 'solo', 'anfitrion' (transmitis) o 'espectador' (mirás lo que abre el otro). */
  modo: (cual) => ipcRenderer.send('vexa:modo', cual),

  /** Avisa si el panel de sesion esta tapando el navegador. */
  panel: (abierto) => ipcRenderer.send('vexa:panel', abierto),

  /** El anfitrion presta o recupera el control de su navegador. */
  cederControl: (cedido) => ipcRenderer.send('vexa:ceder-control', cedido),

  /** Repite un mando que mando el espectador (mouse o teclado). */
  mando: (mensaje) => ipcRenderer.send('vexa:mando', mensaje),

  /** El espectador con control pidio abrir una direccion. */
  navegarRemoto: (texto) => ipcRenderer.send('vexa:navegar-remoto', texto),

  /** Pantalla completa, para el que esta mirando el video del otro. */
  pantallaCompleta: (completa) => ipcRenderer.send('vexa:pantalla-completa', completa),

  /** Cierra la ventana desde la interfaz. */
  cerrarVentana: () => ipcRenderer.send('vexa:cerrar'),

  /** Avisos que llegan desde el proceso principal. */
  al: escuchar,
});
