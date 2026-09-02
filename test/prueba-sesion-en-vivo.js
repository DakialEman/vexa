// Prueba en vivo de la sesion compartida. NO se empaqueta con la app: la corre
// el proceso principal dentro de la ventana cuando se pide VEXA_SMOKE_SESION=1.
//
// Arma las dos puntas de la conexion en la misma ventana (una transmite el
// navegador interno, la otra recibe) y comprueba que llegue video de verdad,
// pasando por los mismos codigos de invitacion que usarian dos amigos.

(async () => {
  const pasos = [];
  const anotar = (paso, detalle) => {
    pasos.push(`${paso}: ${detalle}`);
    console.log(`[prueba] ${paso}: ${detalle}`);
  };

  const esperarDirecciones = (pc, ms = 6000) =>
    new Promise((listo) => {
      if (pc.iceGatheringState === 'complete') return listo();
      const reloj = setTimeout(listo, ms);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(reloj);
          listo();
        }
      });
    });

  let anfitrion = null;
  let espectador = null;
  let captura = null;

  try {
    // 1. Capturar el navegador interno.
    captura = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const pistasVideo = captura.getVideoTracks().length;
    const pistasAudio = captura.getAudioTracks().length;
    if (pistasVideo === 0) throw new Error('la captura no trajo imagen');
    anotar('captura', `${pistasVideo} pista de video, ${pistasAudio} de audio`);

    // 2. Las dos puntas.
    const configuracion = await window.vexa.configuracionIce();
    anfitrion = new RTCPeerConnection(configuracion);
    espectador = new RTCPeerConnection(configuracion);

    let streamRecibido = null;
    espectador.addEventListener('track', (evento) => {
      streamRecibido = evento.streams[0];
    });

    for (const pista of captura.getTracks()) anfitrion.addTrack(pista, captura);

    // 3. Invitacion, con el codigo real.
    await anfitrion.setLocalDescription(await anfitrion.createOffer());
    await esperarDirecciones(anfitrion);

    const invitacion = await window.vexa.armarCodigo('oferta', anfitrion.localDescription.sdp);
    if (!invitacion.ok) throw new Error(`no se armo la invitacion: ${invitacion.motivo}`);
    anotar('codigo de invitacion', `${invitacion.codigo.length} caracteres`);

    // Se pasa por chat, se pega con espacios y saltos de linea de por medio.
    const comoLlega = `  ${invitacion.codigo.slice(0, 60)}\n${invitacion.codigo.slice(60)}  `;
    const leida = await window.vexa.leerCodigo(comoLlega);
    if (!leida.ok) throw new Error(`no se leyo la invitacion: ${leida.motivo}`);

    // 4. Respuesta.
    await espectador.setRemoteDescription({ type: 'offer', sdp: leida.sdp });
    await espectador.setLocalDescription(await espectador.createAnswer());
    await esperarDirecciones(espectador);

    const respuesta = await window.vexa.armarCodigo('respuesta', espectador.localDescription.sdp);
    if (!respuesta.ok) throw new Error(`no se armo la respuesta: ${respuesta.motivo}`);
    anotar('codigo de respuesta', `${respuesta.codigo.length} caracteres`);

    const leidaRespuesta = await window.vexa.leerCodigo(respuesta.codigo);
    if (!leidaRespuesta.ok) throw new Error(`no se leyo la respuesta: ${leidaRespuesta.motivo}`);
    await anfitrion.setRemoteDescription({ type: 'answer', sdp: leidaRespuesta.sdp });

    // 5. Esperar a que se conecten.
    await new Promise((listo, fallar) => {
      const reloj = setTimeout(() => fallar(new Error('no se conectaron en 20 s')), 20000);
      const mirar = () => {
        if (anfitrion.connectionState === 'connected') {
          clearTimeout(reloj);
          listo();
        } else if (anfitrion.connectionState === 'failed') {
          clearTimeout(reloj);
          fallar(new Error('la conexion fallo'));
        }
      };
      anfitrion.addEventListener('connectionstatechange', mirar);
      mirar();
    });
    anotar('conexion', anfitrion.connectionState);
    if (!streamRecibido) throw new Error('el espectador no recibio ningun stream');
    anotar('stream recibido', `${streamRecibido.getVideoTracks().length} pista de video`);

    // 6. Confirmar que realmente llegan cuadros de video, no solo la conexion.
    let cuadros = 0;
    let bytes = 0;
    for (let intento = 0; intento < 12 && cuadros === 0; intento += 1) {
      await new Promise((r) => setTimeout(r, 500));
      for (const informe of await espectador.getStats()) {
        if (informe[1].type === 'inbound-rtp' && informe[1].kind === 'video') {
          cuadros = informe[1].framesDecoded ?? 0;
          bytes = informe[1].bytesReceived ?? 0;
        }
      }
    }
    if (cuadros === 0) throw new Error(`no llego video (bytes recibidos: ${bytes})`);
    anotar('video en vivo', `${cuadros} cuadros decodificados, ${bytes} bytes`);

    return { ok: true, pasos };
  } catch (error) {
    return { ok: false, motivo: error.message, pasos };
  } finally {
    if (captura) captura.getTracks().forEach((pista) => pista.stop());
    if (anfitrion) anfitrion.close();
    if (espectador) espectador.close();
  }
})();
