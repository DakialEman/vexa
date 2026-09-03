'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { IDIOMAS, POR_DEFECTO, TEXTOS, comoPideLasPaginas, existe, listar, normalizar, t } =
  require('../src/idiomas.js');

test('todos los idiomas tienen las mismas claves que el castellano', () => {
  const referencia = Object.keys(TEXTOS[POR_DEFECTO]).sort();

  for (const [idioma, textos] of Object.entries(TEXTOS)) {
    const claves = Object.keys(textos).sort();
    const faltan = referencia.filter((c) => !claves.includes(c));
    const sobran = claves.filter((c) => !referencia.includes(c));
    assert.deepEqual(faltan, [], `a "${idioma}" le faltan claves`);
    assert.deepEqual(sobran, [], `"${idioma}" tiene claves que no existen en castellano`);
  }
});

test('ningun texto quedo vacio', () => {
  for (const [idioma, textos] of Object.entries(TEXTOS)) {
    for (const [clave, texto] of Object.entries(textos)) {
      assert.equal(typeof texto, 'string', `${idioma}/${clave} no es texto`);
      assert.notEqual(texto.trim(), '', `${idioma}/${clave} esta vacio`);
    }
  }
});

test('cada idioma declara como pide las paginas', () => {
  for (const [codigo, datos] of Object.entries(IDIOMAS)) {
    assert.equal(typeof datos.pideAsi, 'string');
    assert.match(datos.pideAsi, new RegExp(`^${codigo}`), `${codigo} deberia pedir su propio idioma primero`);
    assert.equal(typeof datos.nombre, 'string');
  }
});

test('busca el texto en el idioma pedido', () => {
  assert.equal(t('sesion.abrir', 'es'), 'Abrir una sala');
  assert.equal(t('sesion.abrir', 'en'), 'Open a room');
  assert.equal(t('sesion.abrir', 'pt'), 'Abrir uma sala');
});

test('si el idioma no existe, cae al castellano', () => {
  for (const idioma of ['fr', '', null, undefined, 42, {}]) {
    assert.equal(t('sesion.abrir', idioma), 'Abrir una sala');
  }
});

test('una clave que no existe se devuelve tal cual, para que el hueco se note', () => {
  assert.equal(t('esta.clave.no.existe', 'es'), 'esta.clave.no.existe');
});

test('reemplaza los datos entre llaves', () => {
  const texto = t('estado.servidorAnda', 'es', { segundos: '1.4' });
  assert.match(texto, /1\.4 segundos/);
  assert.equal(texto.includes('{'), false);
});

test('un dato que falta deja la llave visible en vez de romper', () => {
  const texto = t('estado.servidorAnda', 'es', { otraCosa: 1 });
  assert.match(texto, /\{segundos\}/);
});

test('normalizar y existe se comportan igual ante basura', () => {
  assert.equal(existe('es'), true);
  assert.equal(existe('en'), true);
  assert.equal(existe('marciano'), false);
  assert.equal(existe(null), false);
  assert.equal(normalizar('pt'), 'pt');
  assert.equal(normalizar('marciano'), POR_DEFECTO);
  assert.equal(normalizar(undefined), POR_DEFECTO);
});

test('comoPideLasPaginas devuelve solo codigos, sin pesos', () => {
  assert.equal(comoPideLasPaginas('es'), 'es-AR,es,en');
  assert.equal(comoPideLasPaginas('en'), 'en-US,en');
  // Ante basura, castellano.
  assert.equal(comoPideLasPaginas('marciano'), comoPideLasPaginas('es'));
});

test('ningun idioma lleva pesos escritos a mano', () => {
  // Chromium los agrega solo. Si vienen puestos, la cabecera sale con el peso
  // repetido ("es;q=0.9;q=0.9") y queda malformada.
  for (const [codigo, datos] of Object.entries(IDIOMAS)) {
    assert.equal(datos.pideAsi.includes(';q='), false, `${codigo} trae pesos escritos a mano`);
    assert.match(datos.pideAsi, /^[a-zA-Z,-]+$/, `${codigo} tiene caracteres raros`);
  }
});

test('listar devuelve los idiomas para armar el selector', () => {
  const lista = listar();
  assert.equal(lista.length, Object.keys(IDIOMAS).length);
  assert.deepEqual(lista.find((i) => i.codigo === 'es'), { codigo: 'es', nombre: 'Español' });
  for (const idioma of lista) {
    assert.equal(typeof idioma.codigo, 'string');
    assert.equal(typeof idioma.nombre, 'string');
  }
});
