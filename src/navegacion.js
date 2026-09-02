'use strict';

// Vexa — logica de navegacion, sin interfaz.
// Decide que hacer con lo que el usuario escribe en la barra: abrir una
// direccion o buscar en internet. Se testea sola (ver test/navegacion.test.js).

const MOTOR_DE_BUSQUEDA = 'https://duckduckgo.com/?q=';

// Vexa solo abre paginas web. Nada de file:, javascript:, data: ni protocolos raros.
const PROTOCOLOS_PERMITIDOS = new Set(['http:', 'https:']);

// "pelispedia.com", "www.sitio.net/algo", "192.168.0.10:8080/x"
const FORMA_DE_DOMINIO = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?([/?#].*)?$/i;

// "localhost" y "localhost:3000/algo"
const FORMA_DE_LOCALHOST = /^localhost(:\d{1,5})?([/?#].*)?$/i;

// "algo:" al principio => el usuario escribio un protocolo a proposito.
const EMPIEZA_CON_PROTOCOLO = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Interpreta lo que se escribio en la barra de direcciones.
 *
 * @param {unknown} entrada Texto crudo escrito por el usuario.
 * @returns {{ok: true, tipo: 'url' | 'busqueda', url: string}
 *         | {ok: false, motivo: string}}
 */
function interpretarEntrada(entrada) {
  if (typeof entrada !== 'string') {
    return { ok: false, motivo: 'No se recibio texto para navegar.' };
  }

  const texto = entrada.trim();

  if (texto === '') {
    return { ok: false, motivo: 'Escribi una direccion o algo para buscar.' };
  }

  // Caso 1: tiene forma de dominio aunque no diga http. Le ponemos https.
  // Va antes que el protocolo a proposito: en "localhost:3000" o "sitio.com:8080"
  // ese ":" es un puerto, no un protocolo.
  if (FORMA_DE_DOMINIO.test(texto) || FORMA_DE_LOCALHOST.test(texto)) {
    try {
      return { ok: true, tipo: 'url', url: new URL(`https://${texto}`).href };
    } catch {
      // Si ni asi arma una URL valida, lo tratamos como busqueda mas abajo.
    }
  }

  // Caso 2: trae protocolo escrito. Se respeta, pero solo si es web.
  if (EMPIEZA_CON_PROTOCOLO.test(texto)) {
    let direccion;
    try {
      direccion = new URL(texto);
    } catch {
      return { ok: false, motivo: `"${texto}" no es una direccion valida.` };
    }

    if (!PROTOCOLOS_PERMITIDOS.has(direccion.protocol)) {
      const protocolo = direccion.protocol.replace(':', '');
      return { ok: false, motivo: `Vexa solo abre paginas web. "${protocolo}" no esta permitido.` };
    }

    return { ok: true, tipo: 'url', url: direccion.href };
  }

  // Caso 3: cualquier otra cosa es una busqueda.
  return {
    ok: true,
    tipo: 'busqueda',
    url: MOTOR_DE_BUSQUEDA + encodeURIComponent(texto),
  };
}

/**
 * Dice si una URL ya armada es una pagina web que Vexa puede abrir.
 * Se usa antes de seguir un link o una redireccion.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
function esNavegable(url) {
  if (typeof url !== 'string' || url === '') return false;
  try {
    return PROTOCOLOS_PERMITIDOS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Version corta de una URL para mostrar en pantalla sin que ocupe media barra.
 *
 * @param {unknown} url
 * @param {number} largoMaximo
 * @returns {string}
 */
function acortarParaMostrar(url, largoMaximo = 70) {
  if (typeof url !== 'string') return '';
  if (url.length <= largoMaximo) return url;
  return `${url.slice(0, largoMaximo - 1)}…`;
}

module.exports = {
  MOTOR_DE_BUSQUEDA,
  acortarParaMostrar,
  esNavegable,
  interpretarEntrada,
};
