'use strict';

// Tests del codigo de invitacion. No abren ventanas ni usan WebRTC.

const test = require('node:test');
const assert = require('node:assert/strict');

const { PREFIJO, TIPOS, armarCodigo, describirEstado, leerCodigo } = require('../src/sesion.js');

// Un SDP corto pero con la forma real de uno.
const SDP_DE_PRUEBA = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=video 9 UDP/TLS/RTP/SAVPF 96',
  'a=mid:0',
  'a=sendonly',
].join('\r\n');

test('un codigo armado se puede volver a leer igual', () => {
  const armado = armarCodigo(TIPOS.OFERTA, SDP_DE_PRUEBA);
  assert.equal(armado.ok, true);
  assert.equal(armado.codigo.startsWith(`${PREFIJO}.`), true);

  const leido = leerCodigo(armado.codigo);
  assert.deepEqual(leido, { ok: true, tipo: TIPOS.OFERTA, sdp: SDP_DE_PRUEBA });
});

test('la respuesta tambien va y vuelve', () => {
  const armado = armarCodigo(TIPOS.RESPUESTA, SDP_DE_PRUEBA);
  assert.equal(leerCodigo(armado.codigo).tipo, TIPOS.RESPUESTA);
});

test('el codigo queda mas corto que el SDP original', () => {
  // Un SDP real es largo; comprimirlo es lo que lo hace pegable en un chat.
  const sdpLargo = `${SDP_DE_PRUEBA}\r\n${'a=candidate:842163049 1 udp 1677729535 190.55.1.1 50000 typ srflx\r\n'.repeat(30)}`;
  const armado = armarCodigo(TIPOS.OFERTA, sdpLargo);
  assert.equal(armado.ok, true);
  assert.ok(
    armado.codigo.length < sdpLargo.length / 2,
    `el codigo (${armado.codigo.length}) deberia ser mucho mas corto que el SDP (${sdpLargo.length})`,
  );
  assert.equal(leerCodigo(armado.codigo).sdp, sdpLargo);
});

test('sobrevive al copiar y pegar del chat', () => {
  const { codigo } = armarCodigo(TIPOS.OFERTA, SDP_DE_PRUEBA);
  const comoLlegaPorWhatsapp = `  "${codigo.slice(0, 40)}\n${codigo.slice(40)}"  `;
  const leido = leerCodigo(comoLlegaPorWhatsapp);
  assert.equal(leido.ok, true);
  assert.equal(leido.sdp, SDP_DE_PRUEBA);
});

test('no arma codigos con un SDP que no lo es', () => {
  for (const sdp of ['', 'hola', null, undefined, 42]) {
    const armado = armarCodigo(TIPOS.OFERTA, sdp);
    assert.equal(armado.ok, false, `deberia rechazar ${String(sdp)}`);
  }
});

test('no arma codigos de un tipo inventado', () => {
  const armado = armarCodigo('cualquiera', SDP_DE_PRUEBA);
  assert.equal(armado.ok, false);
  assert.match(armado.motivo, /Tipo de codigo desconocido/);
});

test('un codigo vacio explica que hay que pegar algo', () => {
  assert.match(leerCodigo('   ').motivo, /Pega el codigo/);
  assert.match(leerCodigo('').motivo, /Pega el codigo/);
});

test('un texto que no es de Vexa se rechaza con claridad', () => {
  const leido = leerCodigo('hola te paso el link de la peli');
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /no parece un codigo de Vexa/);
});

test('un codigo cortado a la mitad avisa que se copio mal', () => {
  const { codigo } = armarCodigo(TIPOS.OFERTA, SDP_DE_PRUEBA);
  const leido = leerCodigo(codigo.slice(0, Math.floor(codigo.length / 2)));
  assert.equal(leido.ok, false);
  assert.match(leido.motivo, /cortado o mal copiado/);
});

test('un codigo sin cuerpo no rompe', () => {
  assert.equal(leerCodigo(`${PREFIJO}.`).ok, false);
});

test('lo que no es texto se rechaza sin romper', () => {
  for (const entrada of [null, undefined, 42, {}, []]) {
    assert.equal(leerCodigo(entrada).ok, false);
  }
});

test('describirEstado traduce todos los estados de WebRTC', () => {
  assert.equal(describirEstado('connected').tono, 'ok');
  assert.equal(describirEstado('failed').tono, 'error');
  assert.equal(describirEstado('connecting').tono, 'trabajando');
  assert.equal(describirEstado('new').tono, 'neutro');
  assert.equal(describirEstado('cualquier cosa').texto, 'Estado desconocido.');
});
