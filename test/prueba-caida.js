// Prueba que, si la conexion se muere, el que miraba vuelva a tener un Vexa
// usable en vez de quedarse con el video congelado.
//
// No necesita un amigo: simula el estado 'failed', que es lo que reporta
// WebRTC cuando la otra punta desaparece.

(async () => {
  const pasos = [];
  const anotar = (paso, detalle) => {
    pasos.push(`${paso}: ${detalle}`);
    console.log(`[prueba] ${paso}: ${detalle}`);
  };
  const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

  try {
    // Nos ponemos en modo espectador, como si estuvieramos mirando.
    window.vexa.modo('espectador');
    await esperar(600);

    const mirando = await window.vexa.estado();
    if (mirando.modo !== 'espectador') throw new Error('no quedo en modo espectador');
    anotar('modo antes de la caida', mirando.modo);

    // La barra tiene que estar bloqueada mientras mira.
    const barra = document.getElementById('entrada');
    if (!barra.readOnly) throw new Error('la barra deberia estar bloqueada mientras mira');
    anotar('barra mientras mira', 'bloqueada, como corresponde');

    // Ahora la conexion se muere.
    const sesionDePrueba = window.__vexaSesionDePrueba;
    if (!sesionDePrueba) throw new Error('la prueba necesita acceso a la sesion');
    sesionDePrueba.simularEstado('failed');
    await esperar(1200);

    const despues = await window.vexa.estado();
    anotar('modo despues de la caida', despues.modo);
    if (despues.modo !== 'solo') throw new Error('quedo atrapado en modo espectador');

    if (barra.readOnly) throw new Error('la barra quedo bloqueada: no puede volver a navegar');
    anotar('barra despues de la caida', 'desbloqueada, puede navegar de nuevo');

    const video = document.getElementById('video-remoto');
    if (video.classList.contains('visible')) throw new Error('el video congelado sigue tapando todo');
    anotar('video congelado', 'se saco de la pantalla');

    const panel = document.getElementById('pantalla-sesion');
    if (!panel.classList.contains('visible')) throw new Error('no se ofrece volver a conectarse');
    anotar('panel', 'vuelve a ofrecer abrir o entrar a una sala');

    return { ok: true, pasos };
  } catch (error) {
    return { ok: false, motivo: error.message, pasos };
  }
})();
