'use strict';

// Vexa — conexion en vivo con el amigo.
//
// El anfitrion captura su navegador interno y se lo manda al espectador por
// una conexion directa entre las dos computadoras (WebRTC). No hay servidor:
// para encontrarse, los dos se pasan un codigo por chat.
//
// Este archivo solo se ocupa de la conexion. Los codigos los arma y los lee el
// proceso principal (src/sesion.js), que ademas se testea aparte.

/* global window */

// Tiempo maximo esperando a que la conexion junte sus direcciones de red.
// Si un servidor STUN no contesta, no nos quedamos colgados para siempre.
const ESPERA_DE_DIRECCIONES = 6000;

// Techo de calidad del video. 8 Mbps alcanza para 1080p con movimiento.
const BITS_POR_SEGUNDO = 8_000_000;

// Como capturamos el navegador interno. El alto y el ritmo son un pedido, no
// una promesa: si la maquina no da, Chromium baja solo.
const PEDIDO_DE_CAPTURA = {
  video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } },
  audio: true,
};

/**
 * Crea el manejador de la sesion compartida.
 *
 * @param {{
 *   alEstado: (estado: string) => void,
 *   alVideo: (stream: MediaStream | null) => void,
 *   alAviso: (texto: string) => void,
 * }} avisos
 */
function crearSesion(avisos) {
  /** @type {RTCPeerConnection | null} */
  let conexion = null;

  /** @type {MediaStream | null} */
  let loQueTransmito = null;

  /** 'solo' | 'anfitrion' | 'espectador' */
  let papel = 'solo';

  /** Arranca una conexion limpia y engancha todos sus avisos. */
  async function nuevaConexion() {
    cortar();

    const configuracion = await window.vexa.configuracionIce();
    conexion = new RTCPeerConnection(configuracion);

    conexion.addEventListener('connectionstatechange', () => {
      if (!conexion) return;
      avisos.alEstado(conexion.connectionState);

      if (conexion.connectionState === 'failed') {
        avisos.alAviso('La conexion directa no se pudo armar. Prueben de nuevo con codigos nuevos.');
      }
    });

    conexion.addEventListener('track', (evento) => {
      const [stream] = evento.streams;
      if (stream) avisos.alVideo(stream);
    });

    return conexion;
  }

  /**
   * Espera a que la conexion termine de juntar sus direcciones de red, porque
   * el codigo tiene que salir con todas adentro (no hay servidor que las mande
   * despues). Si tarda demasiado, seguimos con las que haya.
   */
  function esperarDirecciones(pc) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();

    return new Promise((listo) => {
      const terminar = () => {
        pc.removeEventListener('icegatheringstatechange', mirar);
        clearTimeout(reloj);
        listo();
      };

      const mirar = () => {
        if (pc.iceGatheringState === 'complete') terminar();
      };

      const reloj = setTimeout(() => {
        console.warn('[vexa] Se acabo la espera de direcciones; sigo con las que hay.');
        terminar();
      }, ESPERA_DE_DIRECCIONES);

      pc.addEventListener('icegatheringstatechange', mirar);
    });
  }

  /** Le pide calidad alta y prioridad al movimiento (es video de una peli). */
  async function ajustarCalidad(emisor) {
    try {
      const parametros = emisor.getParameters();
      if (!parametros.encodings || parametros.encodings.length === 0) {
        parametros.encodings = [{}];
      }
      parametros.encodings[0].maxBitrate = BITS_POR_SEGUNDO;
      parametros.degradationPreference = 'maintain-framerate';
      await emisor.setParameters(parametros);
    } catch (error) {
      // No es fatal: se transmite igual, con la calidad que decida Chromium.
      console.warn(`[vexa] No se pudo fijar la calidad: ${error.message}`);
    }
  }

  /** Captura el navegador interno de Vexa (video + audio de la pagina). */
  async function capturarNavegador() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(PEDIDO_DE_CAPTURA);
    } catch (error) {
      throw new Error(`No se pudo capturar el navegador interno: ${error.message}`);
    }

    const [pista] = stream.getVideoTracks();
    if (!pista) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('La captura no devolvio imagen.');
    }

    // Le avisamos a Chromium que esto es video con movimiento, no texto quieto:
    // asi prioriza que sea fluido antes que perfectamente nitido.
    pista.contentHint = 'motion';

    if (stream.getAudioTracks().length === 0) {
      avisos.alAviso('Se transmite la imagen, pero no se pudo capturar el audio de la pagina.');
    }

    return stream;
  }

  /**
   * Anfitrion, paso 1: captura, arma la conexion y devuelve el codigo de
   * invitacion para pasarle al amigo.
   */
  async function crearInvitacion() {
    papel = 'anfitrion';
    const pc = await nuevaConexion();

    loQueTransmito = await capturarNavegador();
    for (const pista of loQueTransmito.getTracks()) {
      const emisor = pc.addTrack(pista, loQueTransmito);
      if (pista.kind === 'video') await ajustarCalidad(emisor);
    }

    // Si el usuario corta la captura desde el sistema, la sesion se termina.
    loQueTransmito.getVideoTracks()[0].addEventListener('ended', () => {
      avisos.alAviso('Se corto la transmision del navegador.');
      cortar();
    });

    await pc.setLocalDescription(await pc.createOffer());
    await esperarDirecciones(pc);

    return armar('oferta', pc.localDescription.sdp);
  }

  /**
   * Espectador: lee la invitacion del amigo y devuelve el codigo de respuesta
   * que tiene que mandarle de vuelta.
   */
  async function responderInvitacion(codigoPegado) {
    const leido = await window.vexa.leerCodigo(codigoPegado);
    if (!leido.ok) throw new Error(leido.motivo);
    if (leido.tipo !== 'oferta') {
      throw new Error('Ese es un codigo de respuesta, no una invitacion.');
    }

    papel = 'espectador';
    const pc = await nuevaConexion();

    await pc.setRemoteDescription({ type: 'offer', sdp: leido.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await esperarDirecciones(pc);

    return armar('respuesta', pc.localDescription.sdp);
  }

  /** Anfitrion, paso 2: recibe la respuesta del amigo y cierra la conexion. */
  async function aceptarRespuesta(codigoPegado) {
    if (!conexion) throw new Error('Primero crea la invitacion.');

    const leido = await window.vexa.leerCodigo(codigoPegado);
    if (!leido.ok) throw new Error(leido.motivo);
    if (leido.tipo !== 'respuesta') {
      throw new Error('Ese es un codigo de invitacion, no una respuesta.');
    }

    if (conexion.signalingState !== 'have-local-offer') {
      throw new Error('Esta invitacion ya no sirve. Genera una nueva.');
    }

    await conexion.setRemoteDescription({ type: 'answer', sdp: leido.sdp });
  }

  /** Pide el codigo al proceso principal y traduce el error si no se pudo. */
  async function armar(tipo, sdp) {
    const armado = await window.vexa.armarCodigo(tipo, sdp);
    if (!armado.ok) throw new Error(armado.motivo);
    return armado.codigo;
  }

  /** Corta todo y deja la sesion como al principio. */
  function cortar() {
    if (loQueTransmito) {
      loQueTransmito.getTracks().forEach((pista) => pista.stop());
      loQueTransmito = null;
    }

    if (conexion) {
      conexion.close();
      conexion = null;
    }

    papel = 'solo';
    avisos.alVideo(null);
    avisos.alEstado('closed');
  }

  return {
    aceptarRespuesta,
    cortar,
    crearInvitacion,
    responderInvitacion,
    get papel() {
      return papel;
    },
  };
}

window.VexaConexion = { crearSesion };
