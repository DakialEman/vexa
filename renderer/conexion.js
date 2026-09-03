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

// Cada cuanto le preguntamos al servidor si el amigo entro.
const CADA_CUANTO_PREGUNTO = 1500;

// Cuantas veces preguntamos antes de dar la sala por vencida (unos 10 minutos,
// que es lo que dura una sala en el servidor).
const VUELTAS_MAXIMAS = Math.ceil((10 * 60 * 1000) / 1500);

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
 *   alMensaje: (mensaje: object) => void,
 * }} avisos
 */
function crearSesion(avisos) {
  /** @type {RTCPeerConnection | null} */
  let conexion = null;

  /** Canal de datos por donde viajan los mandos y los avisos de control. */
  let canal = null;

  /** @type {MediaStream | null} */
  let loQueTransmito = null;

  /** 'solo' | 'anfitrion' | 'espectador' */
  let papel = 'solo';

  /** Codigo de la sala abierta, mientras esperamos al amigo. */
  let codigoDeLaSala = '';

  /** Reloj que le pregunta al servidor si el amigo entro. */
  let espera = null;

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

    // El anfitrion abre el canal; el espectador lo recibe.
    conexion.addEventListener('datachannel', (evento) => engancharCanal(evento.channel));

    return conexion;
  }

  /** Deja listo el canal por donde viajan los mandos del espectador. */
  function engancharCanal(nuevo) {
    canal = nuevo;

    canal.addEventListener('message', (evento) => {
      let mensaje;
      try {
        mensaje = JSON.parse(evento.data);
      } catch {
        console.warn('[vexa] Llego un mensaje que no se pudo leer.');
        return;
      }
      avisos.alMensaje(mensaje);
    });

    canal.addEventListener('close', () => {
      canal = null;
    });
  }

  /**
   * Manda un mensaje por el canal. Devuelve false si todavia no esta abierto,
   * asi el que llama decide si avisar o simplemente descartarlo (los
   * movimientos del mouse se descartan sin drama).
   */
  function enviar(mensaje) {
    if (!canal || canal.readyState !== 'open') return false;
    try {
      canal.send(JSON.stringify(mensaje));
      return true;
    } catch (error) {
      console.warn(`[vexa] No se pudo mandar el mensaje: ${error.message}`);
      return false;
    }
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
   * Anfitrion: captura el navegador, abre la sala en el servidor y devuelve el
   * codigo corto para pasarle al amigo. Despues queda esperando solo.
   *
   * @param {string} codigoPedido Codigo propio, o vacio para que salga uno al azar.
   */
  async function abrirSala(codigoPedido) {
    papel = 'anfitrion';
    const pc = await nuevaConexion();

    // El canal se crea antes de la oferta para que quede descrito adentro.
    engancharCanal(pc.createDataChannel('vexa-control'));

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

    const sala = await window.vexa.crearSala(pc.localDescription.sdp, codigoPedido ?? '');
    if (!sala.ok) {
      cortar();
      throw new Error(sala.motivo);
    }

    codigoDeLaSala = sala.codigo;
    esperarAlAmigo();
    return sala.codigo;
  }

  /**
   * Le pregunta al servidor, cada tanto, si el amigo ya entro. Cuando entra,
   * la conexion se cierra sola y el usuario no tuvo que hacer nada.
   */
  function esperarAlAmigo() {
    let vueltas = 0;

    espera = setInterval(async () => {
      vueltas += 1;

      if (vueltas > VUELTAS_MAXIMAS) {
        dejarDeEsperar();
        avisos.alAviso('Nadie entro a la sala. El codigo vencio, crea una nueva.');
        cortar();
        return;
      }

      const mirada = await window.vexa.mirarRespuesta(codigoDeLaSala);

      if (!mirada.ok) {
        dejarDeEsperar();
        avisos.alAviso(mirada.motivo);
        return;
      }

      if (mirada.esperando) return;

      dejarDeEsperar();

      try {
        if (!conexion || conexion.signalingState !== 'have-local-offer') return;
        await conexion.setRemoteDescription({ type: 'answer', sdp: mirada.respuesta });
      } catch (error) {
        avisos.alAviso(`No se pudo completar la conexion: ${error.message}`);
      }
    }, CADA_CUANTO_PREGUNTO);
  }

  function dejarDeEsperar() {
    if (espera !== null) {
      clearInterval(espera);
      espera = null;
    }
  }

  /**
   * Espectador: entra a la sala con el codigo y listo. No tiene que mandarle
   * nada de vuelta a nadie.
   */
  async function entrarASala(codigo) {
    const sala = await window.vexa.buscarSala(codigo);
    if (!sala.ok) throw new Error(sala.motivo);

    papel = 'espectador';
    const pc = await nuevaConexion();

    await pc.setRemoteDescription({ type: 'offer', sdp: sala.oferta });
    await pc.setLocalDescription(await pc.createAnswer());
    await esperarDirecciones(pc);

    const contestada = await window.vexa.contestarSala(sala.codigo, pc.localDescription.sdp);
    if (!contestada.ok) {
      cortar();
      throw new Error(contestada.motivo);
    }

    return sala.codigo;
  }

  /** Corta todo y deja la sesion como al principio. */
  function cortar() {
    dejarDeEsperar();

    if (codigoDeLaSala !== '') {
      // Que no quede una sala colgada ocupando el codigo.
      window.vexa.cerrarSala(codigoDeLaSala).catch(() => {});
      codigoDeLaSala = '';
    }

    if (loQueTransmito) {
      loQueTransmito.getTracks().forEach((pista) => pista.stop());
      loQueTransmito = null;
    }

    if (canal) {
      canal.close();
      canal = null;
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
    abrirSala,
    cortar,
    entrarASala,
    enviar,
    get papel() {
      return papel;
    },
  };
}

window.VexaConexion = { crearSesion };
