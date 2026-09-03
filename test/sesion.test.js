'use strict';

// Tests de la comunicacion con el servidor de encuentro. Levantan el servidor
// de verdad, asi que prueban las dos puntas juntas.

const test = require('node:test');
const assert = require('node:assert/strict');

const { crearServidor } = require('../servidor/salas.js');
const {
  buscarSala,
  cerrarSala,
  contestarSala,
  crearSala,
  describirEstado,
  mirarRespuesta,
} = require('../src/sesion.js');

const OFERTA = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';
const RESPUESTA = 'v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=-\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';

async function levantar() {
  const servidor = crearServidor();
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  return {
    url: `http://127.0.0.1:${servidor.address().port}`,
    cerrar: () => new Promise((listo) => servidor.close(listo)),
  };
}

test('el camino completo: abrir sala, entrar, contestar y recibir', async () => {
  const { url, cerrar } = await levantar();
  try {
    const sala = await crearSala(url, OFERTA);
    assert.equal(sala.ok, true);
    assert.equal(sala.codigo.length, 6);

    // El amigo entra con el codigo, escrito como se le canta.
    const entrada = await buscarSala(url, `${sala.codigo.slice(0, 3)}-${sala.codigo.slice(3)}`.toLowerCase());
    assert.equal(entrada.ok, true);
    assert.equal(entrada.oferta, OFERTA);

    // Antes de contestar, el anfitrion sigue esperando.
    const esperando = await mirarRespuesta(url, sala.codigo);
    assert.deepEqual(esperando, { ok: true, esperando: true });

    assert.equal((await contestarSala(url, sala.codigo, RESPUESTA)).ok, true);

    const llego = await mirarRespuesta(url, sala.codigo);
    assert.equal(llego.esperando, false);
    assert.equal(llego.respuesta, RESPUESTA);
  } finally {
    await cerrar();
  }
});

test('se puede pedir un codigo propio', async () => {
  const { url, cerrar } = await levantar();
  try {
    const sala = await crearSala(url, OFERTA, 'pepe-y-yo');
    assert.equal(sala.codigo, 'PEPEYYO');
    assert.equal((await buscarSala(url, 'Pepe Y Yo')).ok, true);
  } finally {
    await cerrar();
  }
});

test('un codigo propio ya tomado se avisa con claridad', async () => {
  const { url, cerrar } = await levantar();
  try {
    await crearSala(url, OFERTA, 'la-sala');
    const repetida = await crearSala(url, OFERTA, 'la-sala');
    assert.equal(repetida.ok, false);
    assert.match(repetida.motivo, /ya esta en uso/);
  } finally {
    await cerrar();
  }
});

test('un codigo propio invalido ni siquiera sale de la app', async () => {
  const mala = await crearSala('http://no-se-usa', OFERTA, 'a/b');
  assert.equal(mala.ok, false);
  assert.match(mala.motivo, /letras, numeros y guiones/);
});

test('entrar a una sala que no existe explica que no existe', async () => {
  const { url, cerrar } = await levantar();
  try {
    const nada = await buscarSala(url, 'ZZZZZZ');
    assert.equal(nada.ok, false);
    assert.match(nada.motivo, /No hay ninguna sala/);
  } finally {
    await cerrar();
  }
});

test('sin servidor configurado, el mensaje dice que hay que configurarlo', async () => {
  for (const servidor of ['', null, undefined]) {
    const resultado = await crearSala(servidor, OFERTA);
    assert.equal(resultado.ok, false);
    assert.match(resultado.motivo, /Falta configurar el servidor/);
  }
});

test('si el servidor no contesta, lo dice en castellano y no revienta', async () => {
  // Puerto cerrado: nadie escucha ahi.
  const resultado = await crearSala('http://127.0.0.1:8199', OFERTA);
  assert.equal(resultado.ok, false);
  assert.equal(typeof resultado.motivo, 'string');
  assert.match(resultado.motivo, /servidor/i);
});

test('no se abre una sala con una invitacion que no es una conexion', async () => {
  for (const oferta of ['', 'hola', null, 42]) {
    const resultado = await crearSala('http://no-se-usa', oferta);
    assert.equal(resultado.ok, false);
    assert.match(resultado.motivo, /invitacion valida/);
  }
});

test('no se contesta con algo que no es una conexion', async () => {
  const { url, cerrar } = await levantar();
  try {
    const sala = await crearSala(url, OFERTA);
    const mala = await contestarSala(url, sala.codigo, 'cualquier cosa');
    assert.equal(mala.ok, false);
    assert.match(mala.motivo, /respuesta valida/);
  } finally {
    await cerrar();
  }
});

test('el anfitrion puede cancelar la sala', async () => {
  const { url, cerrar } = await levantar();
  try {
    const sala = await crearSala(url, OFERTA);
    assert.equal((await cerrarSala(url, sala.codigo)).ok, true);
    assert.equal((await buscarSala(url, sala.codigo)).ok, false);
  } finally {
    await cerrar();
  }
});

test('no entran dos personas a la misma sala', async () => {
  const { url, cerrar } = await levantar();
  try {
    const sala = await crearSala(url, OFERTA);
    await contestarSala(url, sala.codigo, RESPUESTA);

    const tercero = await buscarSala(url, sala.codigo);
    assert.equal(tercero.ok, false);
    assert.match(tercero.motivo, /ya entro/);
  } finally {
    await cerrar();
  }
});

test('describirEstado traduce todos los estados de WebRTC', () => {
  assert.equal(describirEstado('connected').tono, 'ok');
  assert.equal(describirEstado('failed').tono, 'error');
  assert.equal(describirEstado('connecting').tono, 'trabajando');
  assert.equal(describirEstado('cualquier cosa').texto, 'Estado desconocido.');
});
