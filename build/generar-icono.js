'use strict';

// Genera build/icon.png, el icono de Vexa: una "V" clara sobre fondo oscuro.
// Lo escribe a mano (PNG es zlib mas una cabecera) para no sumar dependencias.
// Se corre solo cuando hay que rehacer el icono: `node build/generar-icono.js`.

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const LADO = 512;
const RADIO = 96; // esquinas redondeadas

const FONDO = [11, 12, 15];
const VIOLETA = [124, 92, 255];
const CLARO = [231, 233, 239];

/** Mezcla dos colores. `cuanto` se acota a 0 (a) - 1 (b) para no salirse de rango. */
function mezclar(a, b, cuanto) {
  const t = Math.min(1, Math.max(0, cuanto));
  return a.map((canal, i) => Math.round(canal + (b[i] - canal) * t));
}

/** Distancia de un punto a un segmento, para dibujar los trazos de la V. */
function distanciaAlTrazo(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const largo = dx * dx + dy * dy;
  const t = largo === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / largo));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Cuanto del pixel esta dentro del fondo redondeado (0 a 1, con antialias). */
function dentroDelFondo(x, y) {
  const cx = Math.min(Math.max(x, RADIO), LADO - RADIO);
  const cy = Math.min(Math.max(y, RADIO), LADO - RADIO);
  const distancia = Math.hypot(x - cx, y - cy);
  return Math.min(1, Math.max(0, RADIO - distancia + 0.5));
}

function pintar() {
  // Una fila = 1 byte de filtro + LADO pixeles RGBA.
  const crudo = Buffer.alloc(LADO * (1 + LADO * 4));

  // Puntas de la V y grosor del trazo.
  const izq = [148, 150];
  const abajo = [256, 372];
  const der = [364, 150];
  const grosor = 30;

  for (let y = 0; y < LADO; y += 1) {
    const filaEmpieza = y * (1 + LADO * 4);
    crudo[filaEmpieza] = 0; // filtro "ninguno"

    for (let x = 0; x < LADO; x += 1) {
      const distancia = Math.min(
        distanciaAlTrazo(x, y, izq[0], izq[1], abajo[0], abajo[1]),
        distanciaAlTrazo(x, y, abajo[0], abajo[1], der[0], der[1]),
      );

      const enLaV = Math.min(1, Math.max(0, grosor - distancia + 0.5));
      // La V va de violeta arriba a casi blanco abajo.
      const color = mezclar(VIOLETA, CLARO, (y - 150) / 222);
      const pixel = mezclar(FONDO, color, enLaV);
      const opacidad = Math.round(dentroDelFondo(x, y) * 255);

      const donde = filaEmpieza + 1 + x * 4;
      crudo[donde] = pixel[0];
      crudo[donde + 1] = pixel[1];
      crudo[donde + 2] = pixel[2];
      crudo[donde + 3] = opacidad;
    }
  }

  return crudo;
}

/** Arma un trozo de PNG: largo, nombre, datos y su CRC. */
function trozo(nombre, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);

  const cuerpo = Buffer.concat([Buffer.from(nombre, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(cuerpo));

  return Buffer.concat([largo, cuerpo, crc]);
}

function armarPng(crudo) {
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(LADO, 0);
  cabecera.writeUInt32BE(LADO, 4);
  cabecera[8] = 8; // bits por canal
  cabecera[9] = 6; // RGBA
  // Los tres ultimos bytes (compresion, filtro, entrelazado) van en 0.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', cabecera),
    trozo('IDAT', zlib.deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

const destino = path.join(__dirname, 'icon.png');
fs.writeFileSync(destino, armarPng(pintar()));
console.log(`Icono escrito en ${destino}`);
