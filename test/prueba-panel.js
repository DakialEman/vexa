// Prueba de la interfaz: aprieta los botones como los apretaria una persona.
// NO se empaqueta con la app: la corre el proceso principal con VEXA_SMOKE_PANEL=1.
//
// Existe porque la prueba de la sesion usaba la conexion directamente y nunca
// tocaba un boton: un error de cableado en la pantalla pasaba desapercibido.

(() => {
  const pasos = [];
  const anotar = (paso, detalle) => {
    pasos.push(`${paso}: ${detalle}`);
    console.log(`[panel] ${paso}: ${detalle}`);
  };

  const seVe = (id) => {
    const elemento = document.getElementById(id);
    if (!elemento) return 'NO EXISTE';
    if (elemento.hidden) return 'oculto por hidden';
    const estilo = getComputedStyle(elemento);
    if (estilo.display === 'none') return 'oculto por display';
    if (estilo.visibility === 'hidden') return 'oculto por visibility';
    return 'se ve';
  };

  try {
    // 1. Los puentes tienen que estar.
    if (!window.vexa) throw new Error('window.vexa no existe: el preload no cargo');
    if (!window.VexaConexion) throw new Error('window.VexaConexion no existe: conexion.js no cargo');
    if (!window.VexaMando) throw new Error('window.VexaMando no existe: mando.js no cargo');
    anotar('puentes', 'vexa, VexaConexion y VexaMando presentes');

    // 2. El boton tiene que existir.
    const boton = document.getElementById('boton-sesion');
    if (!boton) throw new Error('no existe el boton "Ver juntos"');
    anotar('boton Ver juntos', seVe('boton-sesion'));

    // 3. Apretarlo.
    boton.click();
    anotar('despues del clic, el panel', seVe('pantalla-sesion'));
    anotar('   la pantalla de inicio', seVe('pantalla-inicio'));
    anotar('   los dos botones de adentro', `${seVe('boton-abrir')} / ${seVe('boton-entrar')}`);

    const panel = document.getElementById('pantalla-sesion');
    const visible = panel.classList.contains('visible');
    if (!visible) throw new Error('el panel no quedo visible despues del clic');

    // 4. Ajustes.
    document.getElementById('boton-ajustes').click();
    anotar('despues de tocar Ajustes', seVe('bloque-ajustes'));
    if (document.getElementById('bloque-ajustes').hidden) {
      throw new Error('el bloque de ajustes no se abrio');
    }

    // 5. Entrar con un codigo.
    document.getElementById('boton-entrar').click();
    anotar('despues de tocar Entrar', seVe('sesion-espectador'));
    if (document.getElementById('sesion-espectador').hidden) {
      throw new Error('el bloque para entrar con codigo no se abrio');
    }

    return { ok: true, pasos };
  } catch (error) {
    return { ok: false, motivo: error.message, pasos };
  }
})();
