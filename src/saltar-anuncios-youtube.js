// Vexa — saltea los anuncios de YouTube desde adentro de la pagina.
//
// Este archivo NO se ejecuta en el proceso de Vexa: el proceso principal lo
// lee y lo inyecta en las paginas de YouTube. Por eso no exporta nada y no
// usa nada de Node.
//
// Los anuncios de YouTube vienen del mismo dominio que el video, asi que no se
// pueden cortar por dominio sin romper YouTube. La unica forma es esta:
// apretar "Omitir" cuando aparece, y cuando no se puede omitir, adelantar el
// anuncio hasta el final.
//
// Ojo: YouTube cambia esto cada tanto y el truco deja de andar hasta que se
// ajustan los selectores de abajo. No es un arreglo definitivo.

(() => {
  // Si ya lo inyectamos en esta pagina, no lo hacemos de nuevo.
  if (window.__vexaSalteaAnuncios) return 'ya estaba';
  window.__vexaSalteaAnuncios = true;

  const CADA = 300;

  // Botones de "Omitir anuncio". Cambian de nombre entre versiones de YouTube,
  // asi que probamos todos los que conocemos.
  const BOTONES_OMITIR = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-survey-answer-button',
  ];

  // Carteles que tapan el video sin ser un anuncio en si.
  const CARTELES = [
    '.ytp-ad-overlay-close-button',
    '.ytp-ad-overlay-slot .ytp-ad-overlay-close-container',
  ];

  let volumenPrevio = null;

  function reproductor() {
    return document.querySelector('.html5-video-player');
  }

  function video() {
    return document.querySelector('video.html5-main-video') || document.querySelector('video');
  }

  /** Aprieta el primer boton de omitir que este visible. */
  function omitir() {
    for (const selector of BOTONES_OMITIR) {
      const boton = document.querySelector(selector);
      if (boton && boton.offsetParent !== null) {
        boton.click();
        return true;
      }
    }
    return false;
  }

  /** Cierra los carteles que tapan la imagen. */
  function cerrarCarteles() {
    for (const selector of CARTELES) {
      for (const cartel of document.querySelectorAll(selector)) {
        if (cartel.offsetParent !== null) cartel.click();
      }
    }
  }

  /**
   * Si hay un anuncio que no se puede omitir, lo adelanta hasta el final.
   * Mientras dura, lo silencia: aunque sean dos segundos, se escuchan.
   */
  function adelantar(pelicula) {
    if (volumenPrevio === null) volumenPrevio = pelicula.muted;
    pelicula.muted = true;

    const fin = Number.isFinite(pelicula.duration) ? pelicula.duration : 0;
    if (fin > 0 && pelicula.currentTime < fin - 0.15) {
      pelicula.currentTime = fin;
    }
    // Si esta pausado no avanza nunca y el anuncio no termina.
    if (pelicula.paused) pelicula.play().catch(() => {});
  }

  /** Devuelve el sonido cuando termino el anuncio. */
  function devolverSonido(pelicula) {
    if (volumenPrevio === null) return;
    pelicula.muted = volumenPrevio;
    volumenPrevio = null;
  }

  function revisar() {
    try {
      cerrarCarteles();

      const caja = reproductor();
      const pelicula = video();
      if (!caja || !pelicula) return;

      const hayAnuncio = caja.classList.contains('ad-showing')
        || caja.classList.contains('ad-interrupting');

      if (!hayAnuncio) {
        devolverSonido(pelicula);
        return;
      }

      if (omitir()) return;
      adelantar(pelicula);
    } catch {
      // Si YouTube cambio algo y esto revienta, que no rompa la pagina.
    }
  }

  setInterval(revisar, CADA);
  revisar();

  return 'listo';
})();
