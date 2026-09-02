'use strict';

// Tests de la traduccion de mandos. Es la parte que recibe datos de OTRA
// computadora, asi que lo que mas importa aca es que rechace lo que no entiende.

const test = require('node:test');
const assert = require('node:assert/strict');

const { RUEDA_MAXIMA, traducirEvento } = require('../src/control.js');

const PANTALLA = { ancho: 1000, alto: 500 };

test('un clic en el medio cae en el medio, sin importar el tamaño', () => {
  const mensaje = { tipo: 'raton', accion: 'abajo', x: 0.5, y: 0.5, boton: 'left' };

  const chico = traducirEvento(mensaje, { ancho: 800, alto: 400 });
  assert.deepEqual(chico.eventos.at(-1), {
    type: 'mouseDown', x: 400, y: 200, button: 'left', clickCount: 1, modifiers: [],
  });

  const grande = traducirEvento(mensaje, { ancho: 1920, alto: 1080 });
  assert.equal(grande.eventos.at(-1).x, 960);
  assert.equal(grande.eventos.at(-1).y, 540);
});

test('antes de apretar, el mouse se mueve a ese punto', () => {
  // Chromium descarta un clic en un punto por donde el mouse nunca paso.
  const r = traducirEvento({ tipo: 'raton', accion: 'abajo', x: 0.5, y: 0.5 }, PANTALLA);
  assert.equal(r.eventos.length, 2);
  assert.deepEqual(r.eventos[0], { type: 'mouseMove', x: 500, y: 250, modifiers: [] });
  assert.equal(r.eventos[1].type, 'mouseDown');
});

test('soltar el boton no repite el movimiento', () => {
  const r = traducirEvento({ tipo: 'raton', accion: 'arriba', x: 0.5, y: 0.5 }, PANTALLA);
  assert.equal(r.eventos.length, 1);
  assert.equal(r.eventos[0].type, 'mouseUp');
});

test('mover el mouse se traduce solo', () => {
  const r = traducirEvento({ tipo: 'raton', accion: 'mover', x: 0.25, y: 1 }, PANTALLA);
  assert.deepEqual(r.eventos, [{ type: 'mouseMove', x: 250, y: 500, modifiers: [] }]);
});

test('las posiciones fuera de rango se recortan en vez de romper', () => {
  const r = traducirEvento({ tipo: 'raton', accion: 'mover', x: 5, y: -3 }, PANTALLA);
  assert.equal(r.eventos[0].x, 1000);
  assert.equal(r.eventos[0].y, 0);
});

test('una posicion que no es numero se rechaza', () => {
  for (const x of ['0.5', null, undefined, NaN, Infinity]) {
    const r = traducirEvento({ tipo: 'raton', accion: 'mover', x, y: 0.5 }, PANTALLA);
    assert.equal(r.ok, false, `deberia rechazar x=${String(x)}`);
  }
});

test('el boton del medio se trata como boton izquierdo', () => {
  const r = traducirEvento({ tipo: 'raton', accion: 'abajo', x: 0, y: 0, boton: 'middle' }, PANTALLA);
  assert.equal(r.eventos.at(-1).button, 'left');
});

test('el doble clic se pasa, pero no un numero absurdo de clics', () => {
  const dos = traducirEvento({ tipo: 'raton', accion: 'abajo', x: 0, y: 0, clics: 2 }, PANTALLA);
  assert.equal(dos.eventos.at(-1).clickCount, 2);

  const muchos = traducirEvento({ tipo: 'raton', accion: 'abajo', x: 0, y: 0, clics: 999 }, PANTALLA);
  assert.equal(muchos.eventos.at(-1).clickCount, 3);
});

test('la rueda se limita para que no mande un scroll infinito', () => {
  const normal = traducirEvento({ tipo: 'raton', accion: 'rueda', x: 0.5, y: 0.5, deltaY: -120 }, PANTALLA);
  assert.equal(normal.eventos[0].deltaY, -120);

  const absurdo = traducirEvento({ tipo: 'raton', accion: 'rueda', x: 0.5, y: 0.5, deltaY: 999999 }, PANTALLA);
  assert.equal(absurdo.eventos[0].deltaY, RUEDA_MAXIMA);
});

test('escribir una letra manda la tecla y ademas el caracter', () => {
  const r = traducirEvento({ tipo: 'tecla', accion: 'abajo', tecla: 'a' }, PANTALLA);
  assert.deepEqual(r.eventos, [
    { type: 'keyDown', keyCode: 'a', modifiers: [] },
    { type: 'char', keyCode: 'a', modifiers: [] },
  ]);
});

test('una tecla con nombre no manda caracter', () => {
  const r = traducirEvento({ tipo: 'tecla', accion: 'abajo', tecla: 'Enter' }, PANTALLA);
  assert.equal(r.eventos.length, 1);
  assert.equal(r.eventos[0].type, 'keyDown');
});

test('con Ctrl apretado es un atajo, no texto', () => {
  const r = traducirEvento(
    { tipo: 'tecla', accion: 'abajo', tecla: 'r', modificadores: ['control'] },
    PANTALLA,
  );
  assert.equal(r.eventos.length, 1);
  assert.deepEqual(r.eventos[0].modifiers, ['control']);
});

test('los modificadores inventados se descartan', () => {
  const r = traducirEvento(
    { tipo: 'tecla', accion: 'abajo', tecla: 'a', modificadores: ['control', 'hackear', 42] },
    PANTALLA,
  );
  assert.deepEqual(r.eventos[0].modifiers, ['control']);
});

test('no se aceptan cadenas largas haciendose pasar por una tecla', () => {
  const r = traducirEvento({ tipo: 'tecla', accion: 'abajo', tecla: 'rm -rf /' }, PANTALLA);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /Tecla no permitida/);
});

test('los acentos y emojis cuentan como un solo caracter', () => {
  assert.equal(traducirEvento({ tipo: 'tecla', accion: 'abajo', tecla: 'ñ' }, PANTALLA).ok, true);
  assert.equal(traducirEvento({ tipo: 'tecla', accion: 'abajo', tecla: '😀' }, PANTALLA).ok, true);
});

test('los mensajes basura se rechazan sin romper', () => {
  const basura = [null, undefined, 42, 'hola', [], {}, { tipo: 'raton' }, { tipo: 'otra cosa' }];
  for (const mensaje of basura) {
    const r = traducirEvento(mensaje, PANTALLA);
    assert.equal(r.ok, false, `deberia rechazar ${JSON.stringify(mensaje)}`);
    assert.equal(typeof r.motivo, 'string');
  }
});

test('sin un tamaño valido no se traduce nada', () => {
  const mensaje = { tipo: 'raton', accion: 'mover', x: 0.5, y: 0.5 };
  for (const tamano of [null, undefined, {}, { ancho: 0, alto: 0 }, { ancho: -5, alto: 100 }]) {
    assert.equal(traducirEvento(mensaje, tamano).ok, false);
  }
});
