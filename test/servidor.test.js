'use strict';

// Tests del servidor de encuentro. Levantan el servidor de verdad en un puerto
// libre y le hablan por HTTP, como lo haria la app.

const test = require('node:test');
const assert = require('node:assert/strict');

const { crearServidor } = require('../servidor/salas.js');

const OFERTA = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';
const RESPUESTA = 'v=0\r\no=- 3 4 IN IP4 127.0.0.1\r\ns=-\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n';

/** Levanta un servidor en un puerto libre y devuelve como hablarle. */
async function levantar(opciones) {
  const servidor = crearServidor(opciones);
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const pedir = async (metodo, camino, cuerpo) => {
    const respuesta = await fetch(base + camino, {
      method: metodo,
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    return { estado: respuesta.status, datos: await respuesta.json().catch(() => null) };
  };

  return { servidor, pedir, cerrar: () => new Promise((listo) => servidor.close(listo)) };
}

test('el camino feliz: crear sala, entrar y contestar', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const creada = await pedir('POST', '/salas', { oferta: OFERTA });
    assert.equal(creada.estado, 201);
    assert.equal(creada.datos.codigo.length, 6);

    const codigo = creada.datos.codigo;

    // El amigo entra y recibe la invitacion.
    const entrada = await pedir('GET', `/salas/${codigo}`);
    assert.equal(entrada.estado, 200);
    assert.equal(entrada.datos.oferta, OFERTA);

    // Todavia no contesto: el anfitrion sigue esperando.
    const esperando = await pedir('GET', `/salas/${codigo}/respuesta`);
    assert.equal(esperando.datos.esperando, true);

    // El amigo contesta.
    const contesto = await pedir('POST', `/salas/${codigo}/respuesta`, { respuesta: RESPUESTA });
    assert.equal(contesto.estado, 200);

    // Y ahora si, al anfitrion le llega.
    const llego = await pedir('GET', `/salas/${codigo}/respuesta`);
    assert.equal(llego.datos.esperando, false);
    assert.equal(llego.datos.respuesta, RESPUESTA);
  } finally {
    await cerrar();
  }
});

test('el codigo sirve una sola vez: despues la sala se borra', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const { datos } = await pedir('POST', '/salas', { oferta: OFERTA });
    await pedir('POST', `/salas/${datos.codigo}/respuesta`, { respuesta: RESPUESTA });
    await pedir('GET', `/salas/${datos.codigo}/respuesta`);

    const otraVez = await pedir('GET', `/salas/${datos.codigo}`);
    assert.equal(otraVez.estado, 404);
  } finally {
    await cerrar();
  }
});

test('el codigo se puede escribir con guion o en minusculas', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const { datos } = await pedir('POST', '/salas', { oferta: OFERTA });
    const c = datos.codigo;
    const conGuion = `${c.slice(0, 3)}-${c.slice(3)}`.toLowerCase();

    const entrada = await pedir('GET', `/salas/${conGuion}`);
    assert.equal(entrada.estado, 200);
  } finally {
    await cerrar();
  }
});

test('se puede pedir un codigo propio', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const creada = await pedir('POST', '/salas', { codigo: 'pepe-y-yo', oferta: OFERTA });
    assert.equal(creada.estado, 201);
    assert.equal(creada.datos.codigo, 'PEPEYYO');

    const entrada = await pedir('GET', '/salas/PEPEYYO');
    assert.equal(entrada.estado, 200);
  } finally {
    await cerrar();
  }
});

test('dos salas no pueden tener el mismo codigo propio', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    await pedir('POST', '/salas', { codigo: 'la-sala', oferta: OFERTA });
    const repetida = await pedir('POST', '/salas', { codigo: 'LA-SALA', oferta: OFERTA });
    assert.equal(repetida.estado, 409);
    assert.match(repetida.datos.motivo, /ya esta en uso/);
  } finally {
    await cerrar();
  }
});

test('un codigo propio invalido se rechaza con el motivo', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const mala = await pedir('POST', '/salas', { codigo: 'a/b', oferta: OFERTA });
    assert.equal(mala.estado, 400);
    assert.match(mala.datos.motivo, /letras, numeros y guiones/);
  } finally {
    await cerrar();
  }
});

test('no se crean salas sin una conexion valida adentro', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    for (const oferta of ['', 'hola', null, 42, { a: 1 }]) {
      const mala = await pedir('POST', '/salas', { oferta });
      assert.equal(mala.estado, 400, `deberia rechazar ${JSON.stringify(oferta)}`);
    }
  } finally {
    await cerrar();
  }
});

test('entrar a una sala que no existe da 404', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const nada = await pedir('GET', '/salas/ZZZZZZ');
    assert.equal(nada.estado, 404);
    assert.match(nada.datos.motivo, /No hay ninguna sala/);
  } finally {
    await cerrar();
  }
});

test('no entran dos personas a la misma sala', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const { datos } = await pedir('POST', '/salas', { oferta: OFERTA });
    await pedir('POST', `/salas/${datos.codigo}/respuesta`, { respuesta: RESPUESTA });

    const tercero = await pedir('GET', `/salas/${datos.codigo}`);
    assert.equal(tercero.estado, 409);
    assert.match(tercero.datos.motivo, /ya entro/);
  } finally {
    await cerrar();
  }
});

test('el anfitrion puede cancelar su sala', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const { datos } = await pedir('POST', '/salas', { oferta: OFERTA });
    const borrada = await pedir('DELETE', `/salas/${datos.codigo}`);
    assert.equal(borrada.estado, 200);
    assert.equal((await pedir('GET', `/salas/${datos.codigo}`)).estado, 404);
  } finally {
    await cerrar();
  }
});

test('las salas viejas se borran solas', async () => {
  let momento = 1_000_000;
  const { servidor, pedir, cerrar } = await levantar({ ahora: () => momento });
  try {
    const { datos } = await pedir('POST', '/salas', { oferta: OFERTA });
    assert.equal(servidor.salas.size, 1);

    momento += 11 * 60 * 1000; // once minutos despues
    servidor.barrer();

    assert.equal(servidor.salas.size, 0);
    assert.equal((await pedir('GET', `/salas/${datos.codigo}`)).estado, 404);
  } finally {
    await cerrar();
  }
});

test('probar codigos al azar en masa termina frenado', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    let frenado = false;
    for (let intento = 0; intento < 40 && !frenado; intento += 1) {
      const respuesta = await pedir('GET', `/salas/ZZZZ${intento}`);
      if (respuesta.estado === 429) frenado = true;
    }
    assert.equal(frenado, true, 'deberia haber frenado los intentos a ciegas');
  } finally {
    await cerrar();
  }
});

test('un cuerpo enorme no tumba el servidor', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const gigante = await pedir('POST', '/salas', { oferta: 'v=0\r\n' + 'x'.repeat(400 * 1024) });
    assert.ok(gigante.estado === 400 || gigante.estado === 413, `dio ${gigante.estado}`);
    // Y el servidor sigue vivo.
    assert.equal((await pedir('POST', '/salas', { oferta: OFERTA })).estado, 201);
  } finally {
    await cerrar();
  }
});

test('el chequeo de salud contesta', async () => {
  const { pedir, cerrar } = await levantar();
  try {
    const salud = await pedir('GET', '/salud');
    assert.equal(salud.estado, 200);
    assert.equal(salud.datos.ok, true);
  } finally {
    await cerrar();
  }
});
