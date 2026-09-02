'use strict';

// Vexa — traduccion de los mandos que manda el espectador.
//
// Cuando el anfitrion le pasa el control, el espectador manda por la conexion
// lo que hace con el mouse y el teclado, y el anfitrion lo repite dentro de su
// navegador interno. Todo lo que llega es texto de otra computadora: aca se
// valida entero antes de convertirlo en un evento de verdad.
//
// Las posiciones viajan de 0 a 1 (proporcion de la pantalla), no en pixeles,
// para que funcione aunque los dos tengan ventanas de distinto tamaño.

/** Teclas con nombre que aceptamos tal cual. El resto tiene que ser un caracter. */
const TECLAS_CON_NOMBRE = new Set([
  'Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'Home', 'End',
  'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ' ',
]);

/** Modificadores validos para Electron. */
const MODIFICADORES = new Set(['shift', 'control', 'alt', 'meta']);

/** Botones del mouse que repetimos. El del medio no, para no abrir pestañas. */
const BOTONES = new Set(['left', 'right']);

/** Tope de la rueda, para que un mensaje raro no mande un scroll infinito. */
const RUEDA_MAXIMA = 400;

/** Deja un numero de 0 a 1 dentro de rango, o devuelve null si no es un numero. */
function proporcion(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  return Math.min(1, Math.max(0, valor));
}

/** Limita la rueda a algo razonable. */
function rueda(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 0;
  return Math.min(RUEDA_MAXIMA, Math.max(-RUEDA_MAXIMA, Math.round(valor)));
}

/** Se queda solo con los modificadores conocidos. */
function modificadores(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.filter((m) => MODIFICADORES.has(m));
}

/**
 * Convierte un mensaje del espectador en eventos para sendInputEvent.
 *
 * @param {unknown} mensaje Lo que llego por la conexion, ya parseado.
 * @param {{ancho: number, alto: number}} tamano Tamaño del navegador interno.
 * @returns {{ok: true, eventos: object[]} | {ok: false, motivo: string}}
 */
function traducirEvento(mensaje, tamano) {
  if (mensaje === null || typeof mensaje !== 'object') {
    return { ok: false, motivo: 'El mando llego vacio o mal formado.' };
  }

  const ancho = Number(tamano?.ancho);
  const alto = Number(tamano?.alto);
  if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho <= 0 || alto <= 0) {
    return { ok: false, motivo: 'No se sabe el tamaño del navegador.' };
  }

  switch (mensaje.tipo) {
    case 'raton':
      return traducirRaton(mensaje, ancho, alto);
    case 'tecla':
      return traducirTecla(mensaje);
    default:
      return { ok: false, motivo: `Tipo de mando desconocido: ${String(mensaje.tipo)}.` };
  }
}

function traducirRaton(mensaje, ancho, alto) {
  const px = proporcion(mensaje.x);
  const py = proporcion(mensaje.y);
  if (px === null || py === null) {
    return { ok: false, motivo: 'El mando del mouse llego sin posicion valida.' };
  }

  const x = Math.round(px * ancho);
  const y = Math.round(py * alto);
  const teclas = modificadores(mensaje.modificadores);

  switch (mensaje.accion) {
    case 'mover':
      return { ok: true, eventos: [{ type: 'mouseMove', x, y, modifiers: teclas }] };

    case 'abajo':
    case 'arriba': {
      const boton = BOTONES.has(mensaje.boton) ? mensaje.boton : 'left';
      const esAbajo = mensaje.accion === 'abajo';
      const veces = esAbajo ? Math.min(3, Math.max(1, Number(mensaje.clics) || 1)) : 1;

      const eventos = [];

      // Chromium ignora un clic si el mouse no paso antes por ese punto. Con el
      // mouse eso pasa solo, pero un toque en el trackpad o el primer clic
      // despues de tomar el control pueden llegar sin ningun movimiento previo.
      if (esAbajo) eventos.push({ type: 'mouseMove', x, y, modifiers: teclas });

      eventos.push({
        type: esAbajo ? 'mouseDown' : 'mouseUp',
        x,
        y,
        button: boton,
        clickCount: veces,
        modifiers: teclas,
      });

      return { ok: true, eventos };
    }

    case 'rueda':
      return {
        ok: true,
        eventos: [{
          type: 'mouseWheel',
          x,
          y,
          deltaX: rueda(mensaje.deltaX),
          deltaY: rueda(mensaje.deltaY),
          canScroll: true,
          modifiers: teclas,
        }],
      };

    default:
      return { ok: false, motivo: `Accion de mouse desconocida: ${String(mensaje.accion)}.` };
  }
}

function traducirTecla(mensaje) {
  const tecla = mensaje.tecla;

  if (typeof tecla !== 'string' || tecla === '') {
    return { ok: false, motivo: 'El mando del teclado llego sin tecla.' };
  }

  // O es una tecla con nombre conocido, o es un solo caracter para escribir.
  const esConNombre = TECLAS_CON_NOMBRE.has(tecla);
  if (!esConNombre && [...tecla].length !== 1) {
    return { ok: false, motivo: `Tecla no permitida: ${tecla}.` };
  }

  const teclas = modificadores(mensaje.modificadores);

  if (mensaje.accion === 'arriba') {
    return { ok: true, eventos: [{ type: 'keyUp', keyCode: tecla, modifiers: teclas }] };
  }

  if (mensaje.accion !== 'abajo') {
    return { ok: false, motivo: `Accion de teclado desconocida: ${String(mensaje.accion)}.` };
  }

  const eventos = [{ type: 'keyDown', keyCode: tecla, modifiers: teclas }];

  // Para que se escriba el caracter hace falta ademas el evento 'char'.
  // No va con Ctrl o Alt apretados: ahi la tecla es un atajo, no texto.
  const esTexto = !esConNombre || tecla === ' ';
  const esAtajo = teclas.includes('control') || teclas.includes('alt') || teclas.includes('meta');
  if (esTexto && !esAtajo) {
    eventos.push({ type: 'char', keyCode: tecla, modifiers: teclas });
  }

  return { ok: true, eventos };
}

module.exports = {
  BOTONES,
  MODIFICADORES,
  RUEDA_MAXIMA,
  TECLAS_CON_NOMBRE,
  traducirEvento,
};
