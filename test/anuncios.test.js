'use strict';

// Tests del bloqueo de anuncios. Lo que mas importa: que no rompa las paginas.

const test = require('node:test');
const assert = require('node:assert/strict');

const { decidir, dominioDe } = require('../src/anuncios.js');

const PAGINA = 'https://pelispedia.com/pelicula/123';

test('bloquea las redes de publicidad conocidas', () => {
  for (const url of [
    'https://popads.net/loader.js',
    'https://www.doubleclick.net/ad',
    'https://exoclick.com/tag',
    'https://taboola.com/recomendados',
  ]) {
    assert.equal(decidir(url, PAGINA).bloquear, true, `deberia bloquear ${url}`);
  }
});

test('bloquea tambien los subdominios', () => {
  assert.equal(decidir('https://ads.serve.popads.net/x.js', PAGINA).bloquear, true);
  assert.equal(decidir('https://a.b.c.doubleclick.net/y', PAGINA).bloquear, true);
});

test('no bloquea lo que necesita la pelicula', () => {
  for (const url of [
    'https://pelispedia.com/player.js',
    'https://cdn.jsdelivr.net/npm/hls.js',
    'https://rr3---sn-abc.googlevideo.com/videoplayback',
    'https://fonts.gstatic.com/s/roboto.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/x.js',
  ]) {
    assert.equal(decidir(url, PAGINA).bloquear, false, `no deberia bloquear ${url}`);
  }
});

test('un dominio que solo se parece a uno bloqueado no cae', () => {
  // "nopopads.net" termina distinto que "popads.net": no tiene que caer.
  assert.equal(decidir('https://nopopads.net/x', PAGINA).bloquear, false);
  assert.equal(decidir('https://micriteo.com/x', PAGINA).bloquear, false);
});

test('no bloquea lo que sirve la propia pagina', () => {
  // Si el sitio se llamara igual que una red de anuncios, igual lo dejamos:
  // ahi vive el reproductor y romperlo es peor que ver un anuncio.
  const decision = decidir('https://popads.net/player.js', 'https://popads.net/peli');
  assert.equal(decision.bloquear, false);
  assert.match(decision.motivo, /misma pagina/);
});

test('una direccion ilegible no se bloquea ni rompe', () => {
  for (const url of ['', 'no soy una url', null, undefined, 42, {}]) {
    const decision = decidir(url, PAGINA);
    assert.equal(decision.bloquear, false);
    assert.equal(typeof decision.motivo, 'string');
  }
});

test('sin saber la pagina, igual bloquea la publicidad', () => {
  assert.equal(decidir('https://popads.net/x.js', null).bloquear, true);
  assert.equal(decidir('https://popads.net/x.js', 'no es una url').bloquear, true);
});

test('dominioDe saca el www y baja a minusculas', () => {
  assert.equal(dominioDe('https://WWW.Ejemplo.COM/x'), 'ejemplo.com');
  assert.equal(dominioDe('http://sub.ejemplo.com'), 'sub.ejemplo.com');
  assert.equal(dominioDe('basura'), null);
});
