// Prueba en que condiciones se puede capturar el navegador interno.
//
// Existe por un error que reporto el usuario al abrir una sala:
// "Timeout starting video source". Las pruebas de antes siempre capturaban
// con una pagina cargada y el navegador a la vista, asi que nunca lo vieron.

(async () => {
  const pasos = [];
  const anotar = (paso, detalle) => {
    pasos.push(`${paso}: ${detalle}`);
    console.log(`[prueba] ${paso}: ${detalle}`);
  };
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

  /** Intenta capturar y cuenta que paso, sin tirar la prueba abajo. */
  async function intentarCapturar(situacion) {
    const desde = Date.now();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const pistas = stream.getVideoTracks().length;
      stream.getTracks().forEach((p) => p.stop());
      anotar(situacion, `capturo en ${Date.now() - desde} ms (${pistas} pista de video)`);
      return true;
    } catch (error) {
      anotar(situacion, `FALLO en ${Date.now() - desde} ms: ${error.message}`);
      return false;
    }
  }

  const resultados = {};

  const alArrancar = await window.vexa.estado();
  anotar('que tiene el navegador al arrancar', `url="${alArrancar.url}" titulo="${alArrancar.titulo}"`);

  // 1. Sin ninguna pagina abierta y con el panel tapando el navegador.
  //    Es exactamente lo que pasa cuando abris Vexa y vas derecho a Ver juntos.
  window.vexa.panel(true);
  await esperar(800);
  const tapado = await window.vexa.estado();
  anotar('   navegador visible', String(tapado.visible));
  resultados.sinPaginaYTapado = await intentarCapturar('sin pagina, panel abierto');

  // 2. Sin pagina, pero con el navegador a la vista.
  window.vexa.panel(false);
  await esperar(800);
  const destapado = await window.vexa.estado();
  anotar('   navegador visible', String(destapado.visible));
  resultados.sinPaginaVisible = await intentarCapturar('sin pagina, panel cerrado');

  // 3. Con una pagina abierta y el panel tapando.
  await window.vexa.navegar('http://127.0.0.1:8124/peli');
  await esperar(2500);
  window.vexa.panel(true);
  await esperar(800);
  resultados.conPaginaYTapado = await intentarCapturar('con pagina, panel abierto');

  // 4. Con pagina y a la vista: lo que probaban todas las pruebas de antes.
  window.vexa.panel(false);
  await esperar(800);
  resultados.conPaginaVisible = await intentarCapturar('con pagina, a la vista');

  // Las cuatro situaciones tienen que poder capturar. La que fallaba era la
  // primera: abrir una sala apenas se abre Vexa, sin haber buscado nada.
  const fallaron = Object.entries(resultados)
    .filter(([, pudo]) => !pudo)
    .map(([situacion]) => situacion);

  if (fallaron.length > 0) {
    return { ok: false, motivo: `no se pudo capturar en: ${fallaron.join(', ')}`, pasos };
  }

  return { ok: true, pasos, resultados };
})();
