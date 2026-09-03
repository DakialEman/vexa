'use strict';

// Vexa — configuracion del usuario.
//
// Un JSON chiquito en la carpeta de datos de la app. Lo unico que guarda hoy
// es a que servidor de encuentro conectarse, pero es el lugar donde va a ir
// creciendo lo demas.
//
// Regla: si el archivo no existe, esta roto o le falta algo, se usan los
// valores por defecto y la app arranca igual. Perder la configuracion es una
// molestia; no arrancar es un problema.

const fs = require('node:fs');
const path = require('node:path');

const idiomas = require('./idiomas.js');

/** Valores de arranque. Servidor vacio = todavia no configurado. */
const POR_DEFECTO = Object.freeze({
  servidor: '',
  idioma: idiomas.POR_DEFECTO,
});

/**
 * Revisa que una direccion de servidor sea usable.
 *
 * @param {unknown} texto
 * @returns {{ok: true, servidor: string} | {ok: false, motivo: string}}
 */
function validarServidor(texto) {
  if (typeof texto !== 'string') {
    return { ok: false, motivo: 'La direccion del servidor no es texto.' };
  }

  const limpio = texto.trim().replace(/\/+$/, '');

  if (limpio === '') {
    return { ok: true, servidor: '' };
  }

  let direccion;
  try {
    direccion = new URL(limpio);
  } catch {
    return { ok: false, motivo: `"${texto}" no es una direccion valida.` };
  }

  if (direccion.protocol !== 'http:' && direccion.protocol !== 'https:') {
    return { ok: false, motivo: 'La direccion tiene que empezar con http:// o https://' };
  }

  return { ok: true, servidor: limpio };
}

/**
 * Lee la configuracion. Nunca falla: ante cualquier problema devuelve los
 * valores por defecto y deja el motivo en `aviso`.
 *
 * @param {string} ruta
 * @returns {{servidor: string, aviso: string}}
 */
function leer(ruta) {
  let crudo;
  try {
    crudo = fs.readFileSync(ruta, 'utf8');
  } catch (error) {
    // Que no exista es lo normal la primera vez, no es un problema.
    const aviso = error.code === 'ENOENT' ? '' : `No se pudo leer la configuracion: ${error.message}`;
    return { ...POR_DEFECTO, aviso };
  }

  let datos;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return { ...POR_DEFECTO, aviso: 'La configuracion estaba dañada y se volvio a los valores por defecto.' };
  }

  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) {
    return { ...POR_DEFECTO, aviso: 'La configuracion no tenia el formato esperado.' };
  }

  const revisado = validarServidor(datos.servidor);

  return {
    servidor: revisado.ok ? revisado.servidor : POR_DEFECTO.servidor,
    // Un idioma desconocido no es motivo de aviso: se cae al castellano y listo.
    idioma: idiomas.normalizar(datos.idioma),
    aviso: revisado.ok ? '' : `Se ignoro el servidor guardado: ${revisado.motivo}`,
  };
}

/**
 * Guarda la configuracion. Escribe a un archivo temporal y recien despues lo
 * mueve encima del bueno: si se corta la luz en el medio, no queda un JSON a
 * medio escribir.
 *
 * @param {string} ruta
 * @param {{servidor?: string, idioma?: string}} datos
 * @returns {{ok: true} | {ok: false, motivo: string}}
 */
function guardar(ruta, datos) {
  const revisado = validarServidor(datos?.servidor ?? '');
  if (!revisado.ok) return { ok: false, motivo: revisado.motivo };

  const aGuardar = {
    servidor: revisado.servidor,
    idioma: idiomas.normalizar(datos?.idioma),
  };
  const contenido = `${JSON.stringify(aGuardar, null, 2)}\n`;
  const temporal = `${ruta}.tmp`;

  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(temporal, contenido, 'utf8');
    fs.renameSync(temporal, ruta);
    return { ok: true };
  } catch (error) {
    try {
      fs.rmSync(temporal, { force: true });
    } catch {
      // Si tampoco se puede limpiar, no hay mucho mas que hacer.
    }
    return { ok: false, motivo: `No se pudo guardar la configuracion: ${error.message}` };
  }
}

module.exports = { POR_DEFECTO, guardar, leer, validarServidor };
