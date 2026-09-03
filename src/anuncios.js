'use strict';

// Vexa — bloqueo de anuncios y rastreadores.
//
// No usa ninguna libreria: es una lista de dominios conocidos de publicidad,
// que es lo que ensucia los sitios de peliculas. La regla es conservadora a
// proposito: se bloquea por dominio, y nunca lo que sirve la propia pagina.
// Preferimos dejar pasar un anuncio antes que romper un reproductor.

/**
 * Dominios de publicidad, popunders y rastreo. Se bloquean ellos y todos sus
 * subdominios. Ordenados por familia para poder mantener la lista a mano.
 */
const DOMINIOS_BLOQUEADOS = new Set([
  // Publicidad de Google
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.com',
  'googletagservices.com',

  // Redes de popunder y publicidad agresiva, las tipicas de sitios de video
  'popads.net',
  'popcash.net',
  'popmyads.com',
  'propellerads.com',
  'propellerclick.com',
  'adsterra.com',
  'exoclick.com',
  'exosrv.com',
  'juicyads.com',
  'trafficjunky.net',
  'trafficfactory.biz',
  'hilltopads.net',
  'adcash.com',
  'clickadu.com',
  'onclickalgo.com',
  'onclickmega.com',
  'poptm.com',
  'zedo.com',
  'adnxs.com',
  'adform.net',
  'adroll.com',
  'criteo.com',
  'criteo.net',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'smartadserver.com',
  'yieldmo.com',
  'bidswitch.net',
  'sharethrough.com',

  // Contenido recomendado (los "13 famosos que...")
  'taboola.com',
  'outbrain.com',
  'mgid.com',
  'revcontent.com',
  'contentabc.com',

  // Rastreo y estadisticas
  'google-analytics.com',
  'googletagmanager.com',
  'scorecardresearch.com',
  'quantserve.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'branch.io',
  'amplitude.com',
  'histats.com',
  'statcounter.com',
]);

/**
 * Patrones de URL de todos los dominios bloqueados, en el formato que entiende
 * el filtro de Chromium.
 *
 * Importa para la velocidad: sin filtro, CADA pedido de CADA pagina (imagenes,
 * scripts, hojas de estilo) tiene que viajar al proceso principal para que le
 * digamos que si. Con el filtro, solo llegan los pedidos que ya sabemos
 * sospechosos, que en una pagina normal son un puñado.
 *
 * @returns {string[]}
 */
function patronesParaFiltrar() {
  const patrones = [];
  for (const dominio of DOMINIOS_BLOQUEADOS) {
    patrones.push(`*://${dominio}/*`, `*://*.${dominio}/*`);
  }
  return patrones;
}

/**
 * Devuelve el dominio de una URL, o null si no se puede leer.
 * @param {unknown} url
 */
function dominioDe(url) {
  if (typeof url !== 'string' || url === '') return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Dice si un dominio esta en la lista, mirando tambien sus dominios padre:
 * "ads.publicidad.popads.net" cae porque termina en "popads.net".
 */
function estaEnLaLista(dominio) {
  const partes = dominio.split('.');
  for (let desde = 0; desde < partes.length - 1; desde += 1) {
    if (DOMINIOS_BLOQUEADOS.has(partes.slice(desde).join('.'))) return true;
  }
  return false;
}

/**
 * Decide si un pedido de la pagina se bloquea.
 *
 * @param {unknown} url Direccion del pedido.
 * @param {unknown} urlDeLaPagina Direccion de la pagina que lo hace.
 * @returns {{bloquear: boolean, motivo: string}}
 */
function decidir(url, urlDeLaPagina) {
  const dominio = dominioDe(url);
  if (dominio === null) return { bloquear: false, motivo: 'No se pudo leer la direccion.' };

  if (!estaEnLaLista(dominio)) {
    return { bloquear: false, motivo: 'No esta en la lista.' };
  }

  // Lo que sirve la propia pagina no se toca: ahi vive el reproductor.
  const dominioPagina = dominioDe(urlDeLaPagina);
  if (dominioPagina !== null && dominioPagina === dominio) {
    return { bloquear: false, motivo: 'Es de la misma pagina.' };
  }

  return { bloquear: true, motivo: `Publicidad o rastreo: ${dominio}` };
}

/**
 * Dominios donde vive el reproductor de YouTube. Sus anuncios no se pueden
 * cortar por dominio: vienen del mismo lugar que el video, asi que bloquearlos
 * seria bloquear YouTube entero. Se saltan desde adentro de la pagina, con el
 * guion de src/saltar-anuncios-youtube.js.
 */
const DOMINIOS_DE_YOUTUBE = new Set(['youtube.com', 'youtube-nocookie.com', 'youtu.be']);

/**
 * Dice si una direccion es de YouTube (incluidos los reproductores incrustados
 * en otras paginas).
 *
 * @param {unknown} url
 * @returns {boolean}
 */
function esYoutube(url) {
  const dominio = dominioDe(url);
  if (dominio === null) return false;

  const partes = dominio.split('.');
  for (let desde = 0; desde < partes.length - 1; desde += 1) {
    if (DOMINIOS_DE_YOUTUBE.has(partes.slice(desde).join('.'))) return true;
  }
  return false;
}

module.exports = {
  DOMINIOS_BLOQUEADOS,
  DOMINIOS_DE_YOUTUBE,
  decidir,
  dominioDe,
  esYoutube,
  patronesParaFiltrar,
};
