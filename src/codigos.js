'use strict';

// Vexa — codigos de sala.
//
// El codigo es lo unico que se pasa por chat: "4K7-M9P". Tiene que ser corto,
// facil de dictar por telefono y dificil de acertar de casualidad.

const crypto = require('node:crypto');

/**
 * Alfabeto sin caracteres que se confunden al leer o dictar:
 * nada de 0/O, 1/I/L. Asi "un cero" nunca es "una o".
 */
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Largo de los codigos que genera Vexa. 31^6 = 887 millones de combinaciones. */
const LARGO = 6;

/** Un codigo elegido a mano tiene que ser legible y no ridiculamente largo. */
const LARGO_MINIMO_PERSONALIZADO = 4;
const LARGO_MAXIMO_PERSONALIZADO = 24;

/** Palabras que nadie deberia poder reservar como sala. */
const RESERVADOS = new Set(['VEXA', 'ADMIN', 'ROOT', 'NULL', 'UNDEFINED', 'SALA']);

/**
 * Genera un codigo al azar. Usa el generador criptografico: si fuera
 * Math.random alcanzaria con mirar unos pocos codigos para predecir el resto.
 *
 * @returns {string} Seis caracteres, sin guion (el guion es solo para mostrar).
 */
function generarCodigo() {
  let codigo = '';
  for (let i = 0; i < LARGO; i += 1) {
    codigo += ALFABETO[crypto.randomInt(ALFABETO.length)];
  }
  return codigo;
}

/**
 * Deja un codigo en su forma canonica: mayusculas y sin nada que no sea letra
 * o numero. Asi "4k7-m9p", "4K7 M9P" y "4K7M9P" son el mismo codigo.
 *
 * @param {unknown} texto
 * @returns {string} Cadena vacia si no se pudo normalizar.
 */
function normalizar(texto) {
  if (typeof texto !== 'string') return '';
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Escribe un codigo para mostrarlo en pantalla. Los de seis caracteres van
 * partidos al medio ("4K7-M9P") porque asi se leen y se dictan mejor.
 *
 * @param {unknown} codigo
 * @returns {string}
 */
function paraMostrar(codigo) {
  const limpio = normalizar(codigo);
  if (limpio.length !== LARGO) return limpio;
  return `${limpio.slice(0, 3)}-${limpio.slice(3)}`;
}

/**
 * Revisa un codigo elegido por el usuario.
 *
 * @param {unknown} texto
 * @returns {{ok: true, codigo: string} | {ok: false, motivo: string}}
 */
function validarPersonalizado(texto) {
  if (typeof texto !== 'string') {
    return { ok: false, motivo: 'No se recibio ningun codigo.' };
  }

  const sobra = texto.trim().replace(/[A-Za-z0-9\s-]/g, '');
  if (sobra !== '') {
    return { ok: false, motivo: 'Solo se pueden usar letras, numeros y guiones.' };
  }

  const codigo = normalizar(texto);

  if (codigo.length < LARGO_MINIMO_PERSONALIZADO) {
    return { ok: false, motivo: `El codigo tiene que tener al menos ${LARGO_MINIMO_PERSONALIZADO} letras o numeros.` };
  }

  if (codigo.length > LARGO_MAXIMO_PERSONALIZADO) {
    return { ok: false, motivo: `El codigo no puede pasar de ${LARGO_MAXIMO_PERSONALIZADO} letras o numeros.` };
  }

  if (RESERVADOS.has(codigo)) {
    return { ok: false, motivo: 'Ese codigo esta reservado, elegi otro.' };
  }

  return { ok: true, codigo };
}

/**
 * Revisa un codigo que alguien esta por usar para entrar a una sala.
 * Acepta tanto los generados como los personalizados.
 *
 * @param {unknown} texto
 * @returns {{ok: true, codigo: string} | {ok: false, motivo: string}}
 */
function validarParaEntrar(texto) {
  const codigo = normalizar(texto);

  if (codigo === '') {
    return { ok: false, motivo: 'Escribi el codigo que te paso tu amigo.' };
  }

  if (codigo.length < LARGO_MINIMO_PERSONALIZADO || codigo.length > LARGO_MAXIMO_PERSONALIZADO) {
    return { ok: false, motivo: 'Ese codigo no tiene forma de codigo de Vexa.' };
  }

  return { ok: true, codigo };
}

module.exports = {
  ALFABETO,
  LARGO,
  LARGO_MAXIMO_PERSONALIZADO,
  LARGO_MINIMO_PERSONALIZADO,
  RESERVADOS,
  generarCodigo,
  normalizar,
  paraMostrar,
  validarParaEntrar,
  validarPersonalizado,
};
