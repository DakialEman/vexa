'use strict';

// Vexa — el lado del espectador cuando le prestan el control.
//
// Toma lo que el espectador hace con el mouse y el teclado sobre el video y lo
// manda por la conexion. Las posiciones viajan de 0 a 1 (proporcion de la
// imagen), asi funciona aunque los dos tengan ventanas de distinto tamaño.
// La validacion de verdad la hace el anfitrion (src/control.js): nunca se
// confia en que el otro lado mande cosas sensatas.

/* global window, document */

// Cada cuanto mandamos la posicion del mouse, como mucho. 60 veces por segundo
// alcanza y sobra, y evita inundar el canal.
const MS_ENTRE_MOVIMIENTOS = 16;

/**
 * @param {HTMLVideoElement} video
 * @param {{
 *   enviar: (mensaje: object) => boolean,
 *   tengoControl: () => boolean,
 * }} puente
 */
function conectarMando(video, puente) {
  let ultimoMovimiento = 0;

  /**
   * Traduce un clic de la ventana a una posicion dentro de la imagen.
   * Como el video se muestra con `object-fit: contain`, hay franjas negras a
   * los costados o arriba que no son parte de la pagina del otro.
   */
  function posicionEnLaImagen(evento) {
    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) return null;

    const caja = video.getBoundingClientRect();
    const escala = Math.min(caja.width / videoWidth, caja.height / videoHeight);
    const ancho = videoWidth * escala;
    const alto = videoHeight * escala;
    const izquierda = caja.left + (caja.width - ancho) / 2;
    const arriba = caja.top + (caja.height - alto) / 2;

    const x = (evento.clientX - izquierda) / ancho;
    const y = (evento.clientY - arriba) / alto;

    // Clic en la franja negra: no corresponde a ningun punto de la pagina.
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function modificadores(evento) {
    const lista = [];
    if (evento.shiftKey) lista.push('shift');
    if (evento.ctrlKey) lista.push('control');
    if (evento.altKey) lista.push('alt');
    if (evento.metaKey) lista.push('meta');
    return lista;
  }

  /** Traduce el boton del mouse del navegador al nombre que espera Electron. */
  function nombreDelBoton(numero) {
    if (numero === 2) return 'right';
    return 'left';
  }

  function activo() {
    return puente.tengoControl() && video.classList.contains('visible');
  }

  video.addEventListener('mousemove', (evento) => {
    if (!activo()) return;

    const ahora = performance.now();
    if (ahora - ultimoMovimiento < MS_ENTRE_MOVIMIENTOS) return;
    ultimoMovimiento = ahora;

    const posicion = posicionEnLaImagen(evento);
    if (!posicion) return;

    puente.enviar({ tipo: 'raton', accion: 'mover', ...posicion, modificadores: modificadores(evento) });
  });

  for (const [nombre, accion] of [['mousedown', 'abajo'], ['mouseup', 'arriba']]) {
    video.addEventListener(nombre, (evento) => {
      if (!activo()) return;
      const posicion = posicionEnLaImagen(evento);
      if (!posicion) return;

      evento.preventDefault();
      // Al hacer clic tomamos el foco, asi las teclas tambien van para alla.
      video.focus();

      puente.enviar({
        tipo: 'raton',
        accion,
        ...posicion,
        boton: nombreDelBoton(evento.button),
        clics: evento.detail || 1,
        modificadores: modificadores(evento),
      });
    });
  }

  // El menu del boton derecho lo maneja la pagina del otro lado, no el nuestro.
  video.addEventListener('contextmenu', (evento) => {
    if (activo()) evento.preventDefault();
  });

  video.addEventListener('wheel', (evento) => {
    if (!activo()) return;
    const posicion = posicionEnLaImagen(evento);
    if (!posicion) return;

    evento.preventDefault();
    puente.enviar({
      tipo: 'raton',
      accion: 'rueda',
      ...posicion,
      deltaX: -evento.deltaX,
      deltaY: -evento.deltaY,
      modificadores: modificadores(evento),
    });
  }, { passive: false });

  for (const [nombre, accion] of [['keydown', 'abajo'], ['keyup', 'arriba']]) {
    video.addEventListener(nombre, (evento) => {
      if (!activo()) return;

      evento.preventDefault();
      puente.enviar({
        tipo: 'tecla',
        accion,
        tecla: evento.key,
        modificadores: modificadores(evento),
      });
    });
  }
}

window.VexaMando = { conectarMando };
