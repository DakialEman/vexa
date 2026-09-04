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

// Cuanto insistimos antes de dar la sala por vencida. Va por reloj y no por
// cantidad de vueltas, porque cada vuelta puede tardar lo suyo.
const VIDA_DE_LA_SALA = 10 * 60 * 1000;

// Techo de calidad del video. Generoso: dentro de una conexion normal el
// codificador nunca lo alcanza, pero si lo dejamos bajo se nota enseguida.
const BITS_POR_SEGUNDO = 12_000_000;

/**
 * Como capturamos el navegador interno.
 *
 * A proposito NO se pide una resolucion: se captura al tamaño real de la
 * ventana. Antes se pedia 1920 "ideal", y en una pantalla mas grande eso
 * terminaba achicando la imagen antes de mandarla. El ritmo si se limita:
 * los cuadros de mas se comen el ancho de banda que preferimos gastar en que
 * se vea nitido.
 */
const PEDIDO_DE_CAPTURA = {
  video: { frameRate: { ideal: 30, max: 30 } },
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

  /** Si seguimos esperando al amigo. Corta las vueltas ya lanzadas. */
  let esperando = false;

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
      // Que no achique la imagen por su cuenta.
      parametros.encodings[0].scaleResolutionDownBy = 1;

      // Cuando la red no da abasto hay que sacrificar algo. Antes sacrificaba
      // la resolucion para mantener los cuadros por segundo, y el resultado
      // era que el otro veia todo borroso: el texto de una pagina se volvia
      // ilegible. Preferimos perder algun cuadro y que se vea nitido.
      parametros.degradationPreference = 'maintain-resolution';
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

    // Le decimos a Chromium que priorice el detalle. Lo que se transmite es un
    // navegador: la mitad del tiempo es texto, y con la pista puesta en
    // 'motion' el codificador tiraba nitidez por la borda para ganar cuadros.
    pista.contentHint = 'detail';

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
    const hasta = Date.now() + VIDA_DE_LA_SALA;
    esperando = true;

    // Una vuelta arranca recien cuando termino la anterior. Con setInterval se
    // pisarian: un pedido al servidor recien despertado tarda hasta un minuto,
    // y para entonces habria cuarenta pedidos en el aire, que ademas hacen
    // saltar el freno por ritmo del propio servidor.
    const otraVuelta = async () => {
      if (!esperando) return;

      if (Date.now() > hasta) {
        dejarDeEsperar();
        avisos.alAviso('Nadie entro a la sala. El codigo vencio, crea una nueva.');
        cortar();
        return;
      }

      const mirada = await window.vexa.mirarRespuesta(codigoDeLaSala);
      if (!esperando) return;

      if (!mirada.ok) {
        dejarDeEsperar();
        avisos.alAviso(mirada.motivo);
        return;
      }

      if (mirada.esperando) {
        espera = setTimeout(otraVuelta, CADA_CUANTO_PREGUNTO);
        return;
      }

      dejarDeEsperar();

      try {
        if (!conexion || conexion.signalingState !== 'have-local-offer') return;
        await conexion.setRemoteDescription({ type: 'answer', sdp: mirada.respuesta });
      } catch (error) {
        avisos.alAviso(`No se pudo completar la conexion: ${error.message}`);
      }
    };

    otraVuelta();
  }

  function dejarDeEsperar() {
    esperando = false;
    if (espera !== null) {
      clearTimeout(espera);
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

  /** Estadisticas crudas de la conexion, para medir la calidad que llega. */
  async function estadisticas() {
    if (!conexion) return [];
    const informes = [];
    for (const informe of await conexion.getStats()) informes.push(informe[1]);
    return informes;
  }

  return {
    abrirSala,
    cortar,
    estadisticas,
    entrarASala,
    enviar,
    get papel() {
      return papel;
    },
  };
}

window.VexaConexion = { crearSesion };
