'use strict';

// Vexa — logica de la sesion compartida, sin interfaz ni WebRTC.
// Se ocupa del "codigo de invitacion": el texto que un amigo le pasa al otro
// por WhatsApp para que las dos apps se encuentren. Adentro va la descripcion
// de la conexion (SDP), comprimida para que el texto sea corto.

const zlib = require('node:zlib');

/** Marca de agua del codigo. El 1 es la version del formato. */
const PREFIJO = 'VEXA1';

/** Quien manda que: el anfitrion arma la oferta, el espectador la respuesta. */
const TIPOS = Object.freeze({
  OFERTA: 'oferta',
  RESPUESTA: 'respuesta',
});

/**
 * Servidores STUN publicos y gratuitos. Solo sirven para que cada computadora
 * descubra su propia direccion publica; el video nunca pasa por ellos.
 */
const SERVIDORES_ICE = Object.freeze([
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]);

/** Un SDP de verdad siempre arranca declarando la version. */
const PARECE_SDP = /(^|\n)v=0(\r?\n|$)/;

/**
 * Arma el codigo que se le pasa al amigo.
 *
 * @param {string} tipo Uno de TIPOS.
 * @param {string} sdp Descripcion de la conexion generada por WebRTC.
 * @returns {{ok: true, codigo: string} | {ok: false, motivo: string}}
 */
function armarCodigo(tipo, sdp) {
  if (tipo !== TIPOS.OFERTA && tipo !== TIPOS.RESPUESTA) {
    return { ok: false, motivo: `Tipo de codigo desconocido: ${String(tipo)}.` };
  }

  if (typeof sdp !== 'string' || !PARECE_SDP.test(sdp)) {
    return { ok: false, motivo: 'La conexion no genero una descripcion valida.' };
  }

  try {
    const paquete = JSON.stringify({ t: tipo, sdp });
    const comprimido = zlib.deflateRawSync(Buffer.from(paquete, 'utf8'), { level: 9 });
    return { ok: true, codigo: `${PREFIJO}.${comprimido.toString('base64url')}` };
  } catch (error) {
    return { ok: false, motivo: `No se pudo armar el codigo: ${error.message}` };
  }
}

/**
 * Lee un codigo pegado por el usuario. Aguanta espacios, saltos de linea y
 * comillas, porque la gente lo copia y pega desde el chat.
 *
 * @param {unknown} texto
 * @returns {{ok: true, tipo: string, sdp: string} | {ok: false, motivo: string}}
 */
function leerCodigo(texto) {
  if (typeof texto !== 'string') {
    return { ok: false, motivo: 'No se recibio ningun codigo.' };
  }

  // Fuera espacios, saltos de linea y comillas que arrastra el copiar y pegar.
  const limpio = texto.replace(/\s+/g, '').replace(/^["'<]+|["'>]+$/g, '');

  if (limpio === '') {
    return { ok: false, motivo: 'Pega el codigo que te paso tu amigo.' };
  }

  if (!limpio.startsWith(`${PREFIJO}.`)) {
    return { ok: false, motivo: 'Eso no parece un codigo de Vexa.' };
  }

  const cuerpo = limpio.slice(PREFIJO.length + 1);
  if (cuerpo === '') {
    return { ok: false, motivo: 'El codigo esta incompleto.' };
  }

  let paquete;
  try {
    const crudo = zlib.inflateRawSync(Buffer.from(cuerpo, 'base64url'));
    paquete = JSON.parse(crudo.toString('utf8'));
  } catch {
    return { ok: false, motivo: 'El codigo esta cortado o mal copiado. Pedile que te lo mande de nuevo.' };
  }

  if (paquete === null || typeof paquete !== 'object') {
    return { ok: false, motivo: 'El codigo no tiene el formato esperado.' };
  }

  if (paquete.t !== TIPOS.OFERTA && paquete.t !== TIPOS.RESPUESTA) {
    return { ok: false, motivo: 'El codigo no dice si es una invitacion o una respuesta.' };
  }

  if (typeof paquete.sdp !== 'string' || !PARECE_SDP.test(paquete.sdp)) {
    return { ok: false, motivo: 'El codigo no trae una conexion valida adentro.' };
  }

  return { ok: true, tipo: paquete.t, sdp: paquete.sdp };
}

/**
 * Traduce el estado crudo de WebRTC a algo que se pueda leer en pantalla.
 *
 * @param {unknown} estado
 * @returns {{texto: string, tono: 'neutro' | 'trabajando' | 'ok' | 'error'}}
 */
function describirEstado(estado) {
  switch (estado) {
    case 'new':
      return { texto: 'Sin conexion.', tono: 'neutro' };
    case 'connecting':
      return { texto: 'Conectando con tu amigo…', tono: 'trabajando' };
    case 'connected':
      return { texto: 'Conectados.', tono: 'ok' };
    case 'disconnected':
      return { texto: 'Se corto la conexion. Reintentando…', tono: 'trabajando' };
    case 'failed':
      return { texto: 'No se pudo conectar. Prueben de nuevo con codigos nuevos.', tono: 'error' };
    case 'closed':
      return { texto: 'Conexion cerrada.', tono: 'neutro' };
    default:
      return { texto: 'Estado desconocido.', tono: 'neutro' };
  }
}

module.exports = {
  PREFIJO,
  SERVIDORES_ICE,
  TIPOS,
  armarCodigo,
  describirEstado,
  leerCodigo,
};
