'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { guardar, leer, validarServidor } = require('../src/config.js');

/** Carpeta temporal propia para cada test, asi no se pisan entre si. */
function carpeta() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vexa-config-'));
}

test('lo guardado se vuelve a leer igual', () => {
  const ruta = path.join(carpeta(), 'config.json');
  assert.deepEqual(guardar(ruta, { servidor: 'https://vexa.ejemplo.com' }), { ok: true });
  assert.equal(leer(ruta).servidor, 'https://vexa.ejemplo.com');
});

test('si el archivo no existe, arranca con los valores por defecto y sin quejarse', () => {
  const config = leer(path.join(carpeta(), 'no-existe.json'));
  assert.equal(config.servidor, '');
  assert.equal(config.aviso, '');
});

test('un archivo dañado no rompe la app, avisa y sigue', () => {
  const ruta = path.join(carpeta(), 'config.json');
  fs.writeFileSync(ruta, '{ esto no es json');
  const config = leer(ruta);
  assert.equal(config.servidor, '');
  assert.match(config.aviso, /dañada/);
});

test('un JSON valido pero con otra forma tampoco rompe', () => {
  const ruta = path.join(carpeta(), 'config.json');
  for (const contenido of ['[]', '"hola"', 'null', '42']) {
    fs.writeFileSync(ruta, contenido);
    const config = leer(ruta);
    assert.equal(config.servidor, '', `fallo con ${contenido}`);
  }
});

test('un servidor invalido guardado a mano se ignora con aviso', () => {
  const ruta = path.join(carpeta(), 'config.json');
  fs.writeFileSync(ruta, JSON.stringify({ servidor: 'ftp://cualquiera' }));
  const config = leer(ruta);
  assert.equal(config.servidor, '');
  assert.match(config.aviso, /Se ignoro el servidor/);
});

test('la barra final del servidor se saca, para no armar direcciones con doble barra', () => {
  assert.deepEqual(validarServidor('https://vexa.com/'), { ok: true, servidor: 'https://vexa.com' });
  assert.deepEqual(validarServidor('https://vexa.com///'), { ok: true, servidor: 'https://vexa.com' });
});

test('se aceptan http y https, y nada mas', () => {
  assert.equal(validarServidor('http://192.168.0.5:8787').ok, true);
  assert.equal(validarServidor('https://vexa.com').ok, true);
  for (const malo of ['ftp://x.com', 'file:///etc', 'javascript:alert(1)']) {
    const revisado = validarServidor(malo);
    assert.equal(revisado.ok, false, `deberia rechazar ${malo}`);
    assert.match(revisado.motivo, /http:\/\/ o https:\/\//);
  }
});

test('dejar el servidor vacio es valido: significa "sin configurar"', () => {
  assert.deepEqual(validarServidor(''), { ok: true, servidor: '' });
  assert.deepEqual(validarServidor('   '), { ok: true, servidor: '' });
});

test('no se guarda un servidor invalido', () => {
  const ruta = path.join(carpeta(), 'config.json');
  const resultado = guardar(ruta, { servidor: 'esto no es una url' });
  assert.equal(resultado.ok, false);
  assert.equal(fs.existsSync(ruta), false, 'no deberia haber creado el archivo');
});

test('guardar crea la carpeta si no existe', () => {
  const ruta = path.join(carpeta(), 'una', 'dos', 'config.json');
  assert.deepEqual(guardar(ruta, { servidor: 'https://vexa.com' }), { ok: true });
  assert.equal(leer(ruta).servidor, 'https://vexa.com');
});

test('guardar no deja archivos temporales tirados', () => {
  const dir = carpeta();
  const ruta = path.join(dir, 'config.json');
  guardar(ruta, { servidor: 'https://vexa.com' });
  assert.deepEqual(fs.readdirSync(dir), ['config.json']);
});

test('guardar de nuevo pisa lo anterior sin dejar restos', () => {
  const dir = carpeta();
  const ruta = path.join(dir, 'config.json');
  guardar(ruta, { servidor: 'https://uno.com' });
  guardar(ruta, { servidor: 'https://dos.com' });
  assert.equal(leer(ruta).servidor, 'https://dos.com');
  assert.deepEqual(fs.readdirSync(dir), ['config.json']);
});
