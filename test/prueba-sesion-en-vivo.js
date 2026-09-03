// Prueba en vivo de la sesion compartida. NO se empaqueta con la app: la corre
// el proceso principal dentro de la ventana cuando se pide VEXA_SMOKE_SESION=1.
//
// Arma las dos puntas en la misma ventana usando el mismo camino que usarian
// dos amigos: una abre una sala en el servidor, la otra entra con el codigo.
// Nadie copia y pega nada.

(async () => {
  const pasos = [];
  const anotar = (paso, detalle) => {
    pasos.push(`${paso}: ${detalle}`);
    console.log(`[prueba] ${paso}: ${detalle}`);
  };

  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

  let anfitrion = null;
  let espectador = null;
  let videoRecibido = null;

  try {
    const ajustes = await window.vexa.ajustes();
    if (ajustes.servidor === '') throw new Error('no hay servidor configurado');
    anotar('servidor', ajustes.servidor);

    anfitrion = window.VexaConexion.crearSesion({
      alEstado: () => {},
      alVideo: () => {},
      alAviso: (texto) => anotar('aviso del anfitrion', texto),
      alMensaje: () => {},
    });

    espectador = window.VexaConexion.crearSesion({
      alEstado: () => {},
      alVideo: (stream) => { videoRecibido = stream; },
      alAviso: (texto) => anotar('aviso del espectador', texto),
      alMensaje: () => {},
    });

    // 1. El anfitrion abre la sala. Esto captura el navegador y publica la
    //    invitacion en el servidor.
    const codigo = await anfitrion.abrirSala('');
    if (typeof codigo !== 'string' || codigo.length !== 6) {
      throw new Error(`el codigo no tiene la forma esperada: ${codigo}`);
    }
    anotar('codigo de sala', `${codigo} (${codigo.length} caracteres)`);

    // 2. El espectador entra. Escribe el codigo como se le canta.
    const comoLoEscribe = `${codigo.slice(0, 3)}-${codigo.slice(3)}`.toLowerCase();
    await espectador.entrarASala(comoLoEscribe);
    anotar('entrada', `entro escribiendo "${comoLoEscribe}"`);

    // 3. El anfitrion se entera solo, sin que nadie le pase nada de vuelta.
    let conectados = false;
    for (let intento = 0; intento < 40 && !conectados; intento += 1) {
      await esperar(500);
      conectados = videoRecibido !== null;
    }
    if (!conectados) throw new Error('el espectador nunca recibio el video');
    anotar('conexion', 'se conectaron solos, sin copiar ni pegar nada');

    // 4. Y llega video de verdad.
    let cuadros = 0;
    for (let intento = 0; intento < 20 && cuadros === 0; intento += 1) {
      await esperar(500);
      const pista = videoRecibido.getVideoTracks()[0];
      if (!pista) continue;
      // Los cuadros los cuenta el elemento de video al reproducirlos.
      const prueba = document.createElement('video');
      prueba.srcObject = videoRecibido;
      prueba.muted = true;
      await prueba.play().catch(() => {});
      await esperar(600);
      const calidad = prueba.getVideoPlaybackQuality?.();
      cuadros = calidad ? calidad.totalVideoFrames : (prueba.readyState >= 2 ? 1 : 0);
      prueba.pause();
      prueba.srcObject = null;
    }
    if (cuadros === 0) throw new Error('llego el stream pero no se reprodujo ningun cuadro');
    anotar('video en vivo', `${cuadros} cuadros reproducidos`);

    return { ok: true, pasos };
  } catch (error) {
    return { ok: false, motivo: error.message, pasos };
  } finally {
    if (anfitrion) anfitrion.cortar();
    if (espectador) espectador.cortar();
  }
})();
