// Prueba con dos Vexa de verdad, cada una en su propio proceso: una abre la
// sala y la otra entra con el codigo, como harian dos amigos en dos casas.
//
// NO se empaqueta con la app. La corre el proceso principal cuando se le pasa
// VEXA_SMOKE_ROL=anfitrion o =espectador.
//
// window.__vexaPrueba lo deja servido el proceso principal: { rol, codigo }.

(async () => {
  const pasos = [];
  const anotar = (paso, detalle) => {
    pasos.push(`${paso}: ${detalle}`);
    console.log(`[prueba] ${paso}: ${detalle}`);
  };
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

  const { rol, codigo, otraPagina } = window.__vexaPrueba ?? {};
  let sesion = null;
  let estadoActual = 'new';
  let videoRecibido = null;
  let meDieronControl = false;
  let paginaQueMiro = '';

  try {
    const ajustes = await window.vexa.ajustes();
    if (ajustes.servidor === '') throw new Error('no hay servidor configurado');

    sesion = window.VexaConexion.crearSesion({
      alEstado: (estado) => {
        // Al preparar la conexion se cierra la anterior, y ese 'closed' de
        // arranque no dice nada. Lo dejamos pasar sin ensuciar el registro.
        if (estado === 'closed' && estadoActual === 'new') return;
        estadoActual = estado;
        anotar('estado', estado);
      },
      alVideo: (stream) => { videoRecibido = stream; },
      alAviso: (texto) => anotar('aviso', texto),
      alMensaje: (mensaje) => {
        if (mensaje?.tipo === 'pagina') {
          paginaQueMiro = mensaje.url ?? '';
          anotar('me contaron que pagina miro', paginaQueMiro);
          return;
        }
        if (mensaje?.tipo === 'control') {
          meDieronControl = Boolean(mensaje.cedido);
          anotar('me avisaron del control', String(meDieronControl));
          return;
        }
        // El anfitrion repite en su navegador lo que hace el espectador.
        if (rol === 'anfitrion' && (mensaje?.tipo === 'raton' || mensaje?.tipo === 'tecla')) {
          window.vexa.mando(mensaje);
        }
      },
    });

    if (rol === 'anfitrion') {
      const suyo = await sesion.abrirSala('');
      // Esta linea la lee el guion de afuera para pasarsela al espectador.
      console.log(`VEXA_CODIGO=${suyo}`);
      anotar('sala abierta', suyo);

      // Esperamos a que el otro entre y se conecte.
      for (let i = 0; i < 120 && estadoActual !== 'connected'; i += 1) await esperar(500);
      if (estadoActual !== 'connected') throw new Error(`el espectador nunca se conecto (estado: ${estadoActual})`);

      anotar('conectados', 'el espectador entro solo, con el codigo');
      window.vexa.modo('anfitrion');
      await esperar(1500);

      // Contarle que pagina estamos mirando (en la app lo hace pintarEstado).
      const mia = await window.vexa.estado();
      sesion.enviar({ tipo: 'pagina', url: mia.url, titulo: mia.titulo });
      anotar('le conte que pagina miro', mia.url);

      // --- Traspaso de control ---
      const antes = (await window.vexa.estado()).titulo;
      anotar('titulo antes de ceder el control', `"${antes}"`);

      window.vexa.cederControl(true);
      if (!sesion.enviar({ tipo: 'control', cedido: true })) {
        throw new Error('no se pudo avisarle al espectador que tiene el control');
      }
      anotar('control', 'cedido al espectador');

      // El espectador ahora manda un clic. Esperamos a que llegue a la pagina.
      let despues = antes;
      for (let i = 0; i < 40 && despues === antes; i += 1) {
        await esperar(500);
        despues = (await window.vexa.estado()).titulo;
      }
      if (despues === antes) throw new Error('el clic del espectador nunca llego a la pagina');
      anotar('el clic del espectador llego', `el titulo paso a "${despues}"`);

      // Y al recuperarlo, los mandos tienen que dejar de aplicarse.
      window.vexa.cederControl(false);
      sesion.enviar({ tipo: 'control', cedido: false });
      anotar('control', 'recuperado');
      await esperar(2500);
      const alFinal = (await window.vexa.estado()).titulo;
      if (alFinal !== despues) {
        throw new Error(`siguen llegando mandos despues de recuperar el control ("${alFinal}")`);
      }
      anotar('tras recuperar el control', 'los mandos ya no se aplican');

      // --- Cambiar de pagina en el medio de la sesion ---
      // La captura esta atada al navegador interno; si al navegar se cortara,
      // el espectador se quedaria mirando una imagen congelada.
      if (otraPagina) {
        const antesDeNavegar = (await window.vexa.estado()).url;
        const fue = await window.vexa.navegar(otraPagina);
        if (!fue.ok) throw new Error(`no se pudo navegar: ${fue.motivo}`);

        let ahora = antesDeNavegar;
        for (let i = 0; i < 30 && ahora === antesDeNavegar; i += 1) {
          await esperar(400);
          ahora = (await window.vexa.estado()).url;
        }
        if (ahora === antesDeNavegar) throw new Error('el anfitrion no llego a cambiar de pagina');
        anotar('cambie de pagina', `${antesDeNavegar} -> ${ahora}`);

        const info = await window.vexa.estado();
        sesion.enviar({ tipo: 'pagina', url: info.url, titulo: info.titulo });

        // Le damos tiempo al espectador para comprobar que sigue viendo.
        await esperar(8000);
      }

      return { ok: true, pasos };
    }

    if (rol === 'espectador') {
      if (!codigo) throw new Error('no me pasaron ningun codigo');
      anotar('entrando con el codigo', codigo);

      await sesion.entrarASala(codigo);

      for (let i = 0; i < 60 && estadoActual !== 'connected'; i += 1) await esperar(500);
      if (estadoActual !== 'connected') throw new Error(`no me conecte (estado: ${estadoActual})`);
      if (!videoRecibido) throw new Error('me conecte pero no llego ningun video');

      const pista = videoRecibido.getVideoTracks()[0];
      anotar('video recibido', `pista "${pista ? pista.kind : 'ninguna'}", audio: ${videoRecibido.getAudioTracks().length}`);

      // Comprobamos que se reproduzca de verdad, no solo que exista.
      const prueba = document.createElement('video');
      prueba.srcObject = videoRecibido;
      prueba.muted = true;
      await prueba.play().catch(() => {});
      let cuadros = 0;
      for (let i = 0; i < 20 && cuadros === 0; i += 1) {
        await esperar(500);
        cuadros = prueba.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
      }
      prueba.pause();
      prueba.srcObject = null;
      if (cuadros === 0) throw new Error('llego el video pero no se reprodujo ningun cuadro');
      anotar('video reproduciendose', `${cuadros} cuadros`);

      // --- Pantalla completa, que es como se mira una pelicula ---
      // Esta prueba usa su propia sesion, asi que el video no paso por la
      // pantalla de la app: se lo damos nosotros, como haria ella.
      const enPantalla = document.getElementById('video-remoto');
      enPantalla.srcObject = videoRecibido;
      enPantalla.classList.add('visible');
      await enPantalla.play().catch(() => {});
      await esperar(500);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', bubbles: true }));
      await esperar(800);
      if (!document.body.classList.contains('completo')) {
        throw new Error('no se pudo poner el video en pantalla completa');
      }
      const videoEnPantalla = document.getElementById('video-remoto');
      if (!videoEnPantalla.classList.contains('completo')) {
        throw new Error('el video no se agrando en pantalla completa');
      }
      anotar('pantalla completa', 'el video tapa la barra');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await esperar(800);
      if (document.body.classList.contains('completo')) {
        throw new Error('no se pudo salir de pantalla completa con Esc');
      }
      anotar('salir con Esc', 'anduvo');
      enPantalla.classList.remove('visible');
      enPantalla.srcObject = null;

      // El anfitrion tiene que habernos contado que esta mirando.
      for (let i = 0; i < 20 && paginaQueMiro === ''; i += 1) await esperar(500);
      if (paginaQueMiro === '') throw new Error('nunca me contaron que pagina esta mirando');

      // --- Esperamos a que nos den el control y probamos manejar ---
      for (let i = 0; i < 40 && !meDieronControl; i += 1) await esperar(500);
      if (!meDieronControl) throw new Error('nunca me dieron el control');

      // Un clic en el medio de la pantalla del otro.
      for (let i = 0; i < 6; i += 1) {
        sesion.enviar({ tipo: 'raton', accion: 'abajo', x: 0.5, y: 0.5, boton: 'left', clics: 1 });
        sesion.enviar({ tipo: 'raton', accion: 'arriba', x: 0.5, y: 0.5, boton: 'left' });
        await esperar(400);
      }
      anotar('mandé clics', 'al navegador del anfitrion');

      // Esperamos a que nos lo saquen, y confirmamos que nos avisaron.
      for (let i = 0; i < 20 && meDieronControl; i += 1) await esperar(500);
      if (meDieronControl) throw new Error('nunca me avisaron que me sacaban el control');
      anotar('me sacaron el control', 'y me avisaron');

      // --- El anfitrion cambia de pagina: tengo que seguir viendo ---
      if (otraPagina) {
        const primera = paginaQueMiro;
        for (let i = 0; i < 40 && paginaQueMiro === primera; i += 1) await esperar(400);
        if (paginaQueMiro === primera) throw new Error('nunca me avisaron del cambio de pagina');
        anotar('el anfitrion cambio de pagina', paginaQueMiro);

        // Y lo que importa: que el video siga llegando, no congelado.
        const mirador = document.createElement('video');
        mirador.srcObject = videoRecibido;
        mirador.muted = true;
        await mirador.play().catch(() => {});
        await esperar(1500);
        const antes = mirador.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
        await esperar(2500);
        const despues = mirador.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
        mirador.pause();
        mirador.srcObject = null;

        anotar('cuadros despues del cambio', `${antes} -> ${despues}`);
        if (despues <= antes) {
          throw new Error('el video se congelo cuando el anfitrion cambio de pagina');
        }
        anotar('el video sigue llegando', 'la captura sobrevivio al cambio de pagina');
      }

      return { ok: true, pasos };
    }

    throw new Error(`rol desconocido: ${rol}`);
  } catch (error) {
    return { ok: false, motivo: error.message, pasos };
  } finally {
    if (sesion) sesion.cortar();
  }
})();
