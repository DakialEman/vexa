'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALFABETO,
  LARGO,
  generarCodigo,
  normalizar,
  paraMostrar,
  validarParaEntrar,
  validarPersonalizado,
} = require('../src/codigos.js');

test('los codigos generados tienen el largo esperado y solo el alfabeto', () => {
  for (let i = 0; i < 200; i += 1) {
    const codigo = generarCodigo();
    assert.equal(codigo.length, LARGO);
    for (const letra of codigo) {
      assert.ok(ALFABETO.includes(letra), `${letra} no esta en el alfabeto`);
    }
  }
});

test('el alfabeto no tiene caracteres que se confundan al dictar', () => {
  for (const confuso of ['0', 'O', '1', 'I', 'L']) {
    assert.equal(ALFABETO.includes(confuso), false, `${confuso} se confunde con otro`);
  }
});

test('dos codigos seguidos no son iguales', () => {
  const vistos = new Set();
  for (let i = 0; i < 500; i += 1) vistos.add(generarCodigo());
  // Con 887 millones de combinaciones, 500 repetidos serian un generador roto.
  assert.equal(vistos.size, 500);
});

test('el mismo codigo escrito de distintas formas se normaliza igual', () => {
  const esperado = '4K7M9P';
  for (const variante of ['4K7M9P', '4k7m9p', '4K7-M9P', ' 4k7 m9p ', '4K7—M9P'.replace('—', '-')]) {
    assert.equal(normalizar(variante), esperado, `fallo con "${variante}"`);
  }
});

test('normalizar no rompe con lo que no es texto', () => {
  for (const entrada of [null, undefined, 42, {}, []]) {
    assert.equal(normalizar(entrada), '');
  }
});

test('para mostrar, los codigos de seis van partidos al medio', () => {
  assert.equal(paraMostrar('4K7M9P'), '4K7-M9P');
  assert.equal(paraMostrar('4k7m9p'), '4K7-M9P');
});

test('un codigo personalizado se muestra entero, sin partir', () => {
  assert.equal(paraMostrar('PEPEYYO'), 'PEPEYYO');
});

test('acepta un codigo personalizado razonable', () => {
  const resultado = validarPersonalizado('pepe-y-yo');
  assert.deepEqual(resultado, { ok: true, codigo: 'PEPEYYO' });
});

test('rechaza codigos personalizados muy cortos o muy largos', () => {
  assert.equal(validarPersonalizado('ab').ok, false);
  assert.equal(validarPersonalizado('a'.repeat(30)).ok, false);
});

test('rechaza codigos personalizados con simbolos raros', () => {
  for (const malo of ['pepe/yo', 'sala@casa', 'hola mundo!', '../otra']) {
    const resultado = validarPersonalizado(malo);
    assert.equal(resultado.ok, false, `deberia rechazar "${malo}"`);
    assert.match(resultado.motivo, /letras, numeros y guiones/);
  }
});

test('no se pueden reservar palabras del sistema', () => {
  for (const reservado of ['vexa', 'ADMIN', 'root']) {
    assert.equal(validarPersonalizado(reservado).ok, false);
  }
});

test('para entrar, acepta tanto los generados como los personalizados', () => {
  assert.deepEqual(validarParaEntrar('4k7-m9p'), { ok: true, codigo: '4K7M9P' });
  assert.deepEqual(validarParaEntrar('pepe-y-yo'), { ok: true, codigo: 'PEPEYYO' });
});

test('para entrar, un codigo vacio pide que escriban algo', () => {
  assert.match(validarParaEntrar('   ').motivo, /Escribi el codigo/);
  assert.match(validarParaEntrar(null).motivo, /Escribi el codigo/);
});

test('para entrar, algo que no tiene forma de codigo se rechaza', () => {
  assert.equal(validarParaEntrar('ab').ok, false);
  assert.equal(validarParaEntrar('x'.repeat(50)).ok, false);
});
