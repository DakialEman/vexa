'use strict';

// Vexa — hablar con el servidor de encuentro.
//
// El servidor guarda por unos minutos los datos que las dos computadoras
// necesitan para encontrarse, y los borra apenas se encontraron. El video
// nunca pasa por ahi: va directo entre las dos.
//
// Todo lo de aca devuelve {ok:true,...} o {ok:false, motivo} y nunca tira
// excepciones: los errores de red son lo normal, no una excepcion.

const { validarParaEntrar, validarPersonalizado } = require('./codigos.js');

/**
 * Servidores STUN publicos y gratuitos. Solo sirven para que cada computadora
 * descubra su propia direccion publica; el video nunca pasa por ellos.
 */
const SERVIDORES_ICE = Object.freeze([
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]);

/**
 * Cuanto esperamos al servidor antes de darlo por caido.
 *
 * Generoso a proposito: en los planes gratuitos (Render y parecidos) la
 * instancia se apaga sola cuando nadie la usa, y el primer pedido tiene que
 * esperar a que arranque de nuevo. Eso tarda entre 30 y 60 segundos. Con un
 * limite corto, el primer intento del dia siempre falla.
 */
const ESPERA = 75_000;

/** Un SDP de verdad siempre arranca declarando la version. */
const PARECE_SDP = /(^|\n)v=0(\r?\n|$)/;

/**
 * Habla con el servidor y traduce cualquier problema a un motivo en castellano.
 *
 * @returns {Promise<{ok: true, datos: object} | {ok: false, motivo: string}>}
 */
async function pedir(servidor, camino, opciones = {}) {
  if (typeof servidor !== 'string' || servidor === '') {
    return { ok: false, motivo: 'Falta configurar el servidor de Vexa (boton Ajustes).' };
  }

  const cortar = AbortSignal.timeout(ESPERA);
  let respuesta;

  try {
    respuesta = await fetch(`${servidor}${camino}`, {
      method: opciones.metodo ?? 'GET',
      headers: opciones.cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
      signal: cortar,
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return {
        ok: false,
        motivo: 'El servidor de Vexa no contesto en 75 segundos. Fijate si la direccion esta bien.',
      };
    }
    return { ok: false, motivo: `No se pudo hablar con el servidor: ${error.message}` };
  }

  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    datos = {};
  }

  if (!respuesta.ok) {
    return { ok: false, motivo: datos.motivo ?? `El servidor contesto ${respuesta.status}.` };
  }

  return { ok: true, datos };
}

/**
 * Le pregunta al servidor si esta vivo. Sirve para dos cosas: comprobar que la
 * direccion sea correcta, y despertarlo antes de abrir una sala.
 */
async function probarServidor(servidor) {
  const desde = Date.now();
  const respuesta = await pedir(servidor, '/salud');
  if (!respuesta.ok) return respuesta;

  if (respuesta.datos.ok !== true) {
    return { ok: false, motivo: 'Esa direccion contesta, pero no parece un servidor de Vexa.' };
  }

  return { ok: true, demora: Date.now() - desde };
}

/**
 * Abre una sala. Si se pide un codigo propio se usa ese; si no, el servidor
 * inventa uno corto.
 */
async function crearSala(servidor, oferta, codigoPedido) {
  if (typeof oferta !== 'string' || !PARECE_SDP.test(oferta)) {
    return { ok: false, motivo: 'La conexion no genero una invitacion valida.' };
  }

  const cuerpo = { oferta };

  if (typeof codigoPedido === 'string' && codigoPedido.trim() !== '') {
    const revisado = validarPersonalizado(codigoPedido);
    if (!revisado.ok) return revisado;
    cuerpo.codigo = revisado.codigo;
  }

  const respuesta = await pedir(servidor, '/salas', { metodo: 'POST', cuerpo });
  if (!respuesta.ok) return respuesta;

  return { ok: true, codigo: respuesta.datos.codigo, vence: respuesta.datos.vence };
}

/** Busca la invitacion de una sala para entrar. */
async function buscarSala(servidor, codigo) {
  const revisado = validarParaEntrar(codigo);
  if (!revisado.ok) return revisado;

  const respuesta = await pedir(servidor, `/salas/${revisado.codigo}`);
  if (!respuesta.ok) return respuesta;

  if (!PARECE_SDP.test(respuesta.datos.oferta ?? '')) {
    return { ok: false, motivo: 'La sala no trae una invitacion valida.' };
  }

  return { ok: true, codigo: revisado.codigo, oferta: respuesta.datos.oferta };
}

/** Deja la respuesta del espectador en la sala. */
async function contestarSala(servidor, codigo, respuestaSdp) {
  const revisado = validarParaEntrar(codigo);
  if (!revisado.ok) return revisado;

  if (typeof respuestaSdp !== 'string' || !PARECE_SDP.test(respuestaSdp)) {
    return { ok: false, motivo: 'La conexion no genero una respuesta valida.' };
  }

  return pedir(servidor, `/salas/${revisado.codigo}/respuesta`, {
    metodo: 'POST',
    cuerpo: { respuesta: respuestaSdp },
  });
}

/**
 * El anfitrion pregunta si su amigo ya entro.
 *
 * @returns {Promise<{ok: true, esperando: boolean, respuesta?: string} | {ok: false, motivo: string}>}
 */
async function mirarRespuesta(servidor, codigo) {
  const revisado = validarParaEntrar(codigo);
  if (!revisado.ok) return revisado;

  const respuesta = await pedir(servidor, `/salas/${revisado.codigo}/respuesta`);
  if (!respuesta.ok) return respuesta;

  if (respuesta.datos.esperando) return { ok: true, esperando: true };

  if (!PARECE_SDP.test(respuesta.datos.respuesta ?? '')) {
    return { ok: false, motivo: 'Tu amigo contesto algo que no se entiende.' };
  }

  return { ok: true, esperando: false, respuesta: respuesta.datos.respuesta };
}

/** Cancela una sala que quedo abierta. */
async function cerrarSala(servidor, codigo) {
  const revisado = validarParaEntrar(codigo);
  if (!revisado.ok) return revisado;
  return pedir(servidor, `/salas/${revisado.codigo}`, { metodo: 'DELETE' });
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
      return { texto: 'No se pudo conectar. Prueben de nuevo.', tono: 'error' };
    case 'closed':
      return { texto: 'Conexion cerrada.', tono: 'neutro' };
    default:
      return { texto: 'Estado desconocido.', tono: 'neutro' };
  }
}

module.exports = {
  ESPERA,
  SERVIDORES_ICE,
  buscarSala,
  cerrarSala,
  contestarSala,
  crearSala,
  describirEstado,
  mirarRespuesta,
  probarServidor,
};
