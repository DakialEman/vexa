'use strict';

// Tests de la logica de navegacion. Corren con `npm test`, sin abrir ninguna
// ventana y sin dependencias extra (usan el test runner que ya trae Node).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MOTOR_DE_BUSQUEDA,
  acortarParaMostrar,
  esNavegable,
  interpretarEntrada,
} = require('../src/navegacion.js');

test('una direccion completa se abre tal cual', () => {
  const resultado = interpretarEntrada('https://pelispedia.com/pelicula/123');
  assert.deepEqual(resultado, {
    ok: true,
    tipo: 'url',
    url: 'https://pelispedia.com/pelicula/123',
  });
});

test('un dominio sin http se abre como https', () => {
  const resultado = interpretarEntrada('pelispedia.com');
  assert.equal(resultado.ok, true);
  assert.equal(resultado.tipo, 'url');
  assert.equal(resultado.url, 'https://pelispedia.com/');
});

test('un dominio con ruta y sin http tambien funciona', () => {
  const resultado = interpretarEntrada('www.sitio.net/serie/temporada-1');
  assert.equal(resultado.url, 'https://www.sitio.net/serie/temporada-1');
});

test('localhost con puerto se toma como direccion, no como busqueda', () => {
  const resultado = interpretarEntrada('localhost:3000/prueba');
  assert.equal(resultado.tipo, 'url');
  assert.equal(resultado.url, 'https://localhost:3000/prueba');
});

test('un dominio con puerto no confunde el ":" con un protocolo', () => {
  const resultado = interpretarEntrada('sitio.com:8080/video');
  assert.equal(resultado.tipo, 'url');
  assert.equal(resultado.url, 'https://sitio.com:8080/video');
});

test('texto suelto se convierte en una busqueda', () => {
  const resultado = interpretarEntrada('el padrino online');
  assert.equal(resultado.ok, true);
  assert.equal(resultado.tipo, 'busqueda');
  assert.equal(resultado.url, `${MOTOR_DE_BUSQUEDA}el%20padrino%20online`);
});

test('una frase con punto y espacios sigue siendo busqueda', () => {
  const resultado = interpretarEntrada('mejor peli de 2024. cual me recomendas');
  assert.equal(resultado.tipo, 'busqueda');
});

test('la barra vacia no navega y explica por que', () => {
  const resultado = interpretarEntrada('   ');
  assert.equal(resultado.ok, false);
  assert.match(resultado.motivo, /Escribi/);
});

test('los protocolos que no son web se rechazan', () => {
  for (const entrada of ['file:///C:/Windows/System32', 'javascript:alert(1)', 'data:text/html,hola']) {
    const resultado = interpretarEntrada(entrada);
    assert.equal(resultado.ok, false, `deberia rechazar ${entrada}`);
    assert.match(resultado.motivo, /solo abre paginas web/);
  }
});

test('una entrada que no es texto se rechaza sin romper', () => {
  for (const entrada of [null, undefined, 42, {}]) {
    assert.equal(interpretarEntrada(entrada).ok, false);
  }
});

test('esNavegable acepta web y rechaza el resto', () => {
  assert.equal(esNavegable('https://sitio.com'), true);
  assert.equal(esNavegable('http://sitio.com'), true);
  assert.equal(esNavegable('file:///etc/passwd'), false);
  assert.equal(esNavegable('no soy una url'), false);
  assert.equal(esNavegable(''), false);
  assert.equal(esNavegable(null), false);
});

test('acortarParaMostrar recorta solo lo largo', () => {
  assert.equal(acortarParaMostrar('https://corto.com'), 'https://corto.com');
  const larga = `https://sitio.com/${'a'.repeat(200)}`;
  assert.equal(acortarParaMostrar(larga).length, 70);
  assert.equal(acortarParaMostrar(larga).endsWith('…'), true);
});
