'use strict';

// Vexa — el servidor de encuentro.
//
// Lo unico que hace es guardar, por unos minutos, los datos que las dos
// computadoras necesitan para encontrarse. Despues los borra. El video nunca
// pasa por aca: va directo entre los dos.
//
// Sin dependencias: todo con lo que trae Node.

const http = require('node:http');

const { generarCodigo, validarParaEntrar, validarPersonalizado } = require('../src/codigos.js');

/** Una sala sin usar se borra a los 10 minutos. */
const VIDA_DE_LA_SALA = 10 * 60 * 1000;

/** Cada cuanto pasamos a barrer las salas vencidas. */
const BARRIDO = 60 * 1000;

/**
 * Ninguna descripcion de conexion legitima pasa de esto. Un SDP real, con
 * todas sus direcciones adentro, ronda los 3 KB; 32 alcanza y sobra.
 */
const CUERPO_MAXIMO = 32 * 1024;

/**
 * Tope de salas abiertas a la vez. Sin esto, alguien puede llenar la memoria
 * del servidor creando salas y nunca usandolas. Con 500 salas de 32 KB el
 * techo son 32 MB, que entra comodo hasta en el plan mas chico.
 */
const SALAS_MAXIMAS = 500;

/** Pasado esto ya no seguimos leyendo por cortesia: cortamos y listo. */
const TOPE_DURO = 4 * 1024 * 1024;

/** Cuantos pedidos por minuto acepta una misma direccion IP. */
const PEDIDOS_POR_MINUTO = 120;

/** Cuantos codigos errados puede probar una IP por minuto, antes de frenarla. */
const ERRORES_POR_MINUTO = 20;

/**
 * Tope por conexion fisica, sin mirar X-Forwarded-For.
 *
 * Esa cabecera se puede falsear: alguien podria inventar una IP distinta en
 * cada pedido para escaparle al freno de arriba. Este segundo tope, mas
 * holgado, no se puede esquivar asi, porque cuenta de donde llega el paquete
 * de verdad. Va alto para no molestar a un hosting que meta a mucha gente
 * detras del mismo proxy.
 */
const PEDIDOS_POR_MINUTO_POR_CONEXION = 1200;

/** Un pedido que no termina de llegar en este tiempo se corta. */
const ESPERA_DE_PEDIDO = 20_000;

/**
 * Crea el servidor.
 *
 * @param {{ahora?: () => number}} opciones Inyectable para poder testear el vencimiento.
 */
function crearServidor(opciones = {}) {
  const ahora = opciones.ahora ?? (() => Date.now());

  /** @type {Map<string, {oferta: string, respuesta: string|null, creada: number}>} */
  const salas = new Map();

  /** @type {Map<string, {pedidos: number, errores: number, desde: number}>} */
  const visitas = new Map();

  /** Lo mismo pero por conexion fisica, que no se puede falsear. */
  const conexiones = new Map();

  function barrer() {
    const limite = ahora() - VIDA_DE_LA_SALA;
    for (const [codigo, sala] of salas) {
      if (sala.creada < limite) salas.delete(codigo);
    }
    for (const [ip, visita] of visitas) {
      if (visita.desde < ahora() - 60_000) visitas.delete(ip);
    }
    for (const [ip, visita] of conexiones) {
      if (visita.desde < ahora() - 60_000) conexiones.delete(ip);
    }
  }

  /**
   * Lleva la cuenta de pedidos por IP.
   * @returns {{permitido: boolean, motivo?: string}}
   */
  function controlarRitmo(ip, fueError, ipDeLaConexion) {
    // Primero el tope que no se puede esquivar falseando cabeceras.
    if (ipDeLaConexion) {
      let porConexion = conexiones.get(ipDeLaConexion);
      if (!porConexion || porConexion.desde < ahora() - 60_000) {
        porConexion = { pedidos: 0, errores: 0, desde: ahora() };
        conexiones.set(ipDeLaConexion, porConexion);
      }
      porConexion.pedidos += 1;
      if (porConexion.pedidos > PEDIDOS_POR_MINUTO_POR_CONEXION) {
        return { permitido: false, motivo: 'Demasiados pedidos. Espera un minuto.' };
      }
    }

    let visita = visitas.get(ip);
    if (!visita || visita.desde < ahora() - 60_000) {
      visita = { pedidos: 0, errores: 0, desde: ahora() };
      visitas.set(ip, visita);
    }

    visita.pedidos += 1;
    if (fueError) visita.errores += 1;

    if (visita.errores > ERRORES_POR_MINUTO) {
      return { permitido: false, motivo: 'Demasiados codigos errados. Espera un minuto.' };
    }
    if (visita.pedidos > PEDIDOS_POR_MINUTO) {
      return { permitido: false, motivo: 'Demasiados pedidos. Espera un minuto.' };
    }
    return { permitido: true };
  }

  function responder(res, estado, datos) {
    const cuerpo = JSON.stringify(datos ?? {});
    res.writeHead(estado, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(cuerpo),
      // La app corre desde un archivo local: su origen es "null".
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Cache-Control': 'no-store',
    });
    res.end(cuerpo);
  }

  /**
   * Lee el cuerpo del pedido.
   *
   * Si viene demasiado grande dejamos de guardarlo, pero seguimos leyendo lo
   * que falta antes de contestar: si cortaramos la conexion de una, el cliente
   * recibiria un error de red en vez de nuestro mensaje. Igual hay un tope
   * duro, para que nadie nos tenga leyendo para siempre.
   */
  function leerCuerpo(req) {
    return new Promise((listo, fallar) => {
      let total = 0;
      let seExcedio = false;
      const partes = [];

      req.on('data', (parte) => {
        total += parte.length;

        if (total > TOPE_DURO) {
          req.destroy();
          fallar(Object.assign(new Error('El pedido es descomunal.'), { estado: 413 }));
          return;
        }

        if (total > CUERPO_MAXIMO) {
          // Ya sabemos que no sirve: dejamos de acumularlo pero seguimos leyendo.
          seExcedio = true;
          partes.length = 0;
          return;
        }

        partes.push(parte);
      });

      req.on('end', () => {
        if (seExcedio) {
          fallar(Object.assign(new Error('El pedido es demasiado grande.'), { estado: 413 }));
          return;
        }
        if (partes.length === 0) return listo({});
        try {
          listo(JSON.parse(Buffer.concat(partes).toString('utf8')));
        } catch {
          fallar(Object.assign(new Error('El cuerpo del pedido no es JSON valido.'), { estado: 400 }));
        }
      });

      req.on('error', fallar);
    });
  }

  /** Una descripcion de conexion de verdad siempre arranca declarando su version. */
  function pareceConexion(valor) {
    return typeof valor === 'string' && valor.length < CUERPO_MAXIMO && /(^|\n)v=0(\r?\n|$)/.test(valor);
  }

  /** Busca un codigo libre. Con 887 millones, un par de intentos alcanzan. */
  function codigoLibre() {
    for (let intento = 0; intento < 12; intento += 1) {
      const codigo = generarCodigo();
      if (!salas.has(codigo)) return codigo;
    }
    return null;
  }

  /**
   * De quien viene el pedido, para llevarle la cuenta.
   *
   * Detras de un proxy (Render, Fly y cualquier hosting) todos los pedidos
   * llegan con la IP del proxy, asi que sin mirar X-Forwarded-For un solo
   * usuario activo frenaria a todos los demas.
   *
   * Esa cabecera se puede falsear, si: alguien podria inventar una IP distinta
   * en cada pedido para escaparle al freno. Preferimos ese riesgo antes que la
   * alternativa, que es frenar a usuarios legitimos entre si.
   */
  function deQuienViene(req) {
    const reenviada = req.headers['x-forwarded-for'];
    if (typeof reenviada === 'string' && reenviada !== '') {
      const primera = reenviada.split(',')[0].trim();
      if (primera !== '') return primera;
    }
    return req.socket.remoteAddress ?? 'desconocida';
  }

  const servidor = http.createServer(async (req, res) => {
    const ip = deQuienViene(req);
    const ipFisica = req.socket.remoteAddress ?? 'desconocida';
    const url = new URL(req.url, 'http://vexa');
    const partes = url.pathname.split('/').filter(Boolean);

    if (req.method === 'OPTIONS') return responder(res, 204, null);

    // Para saber si el servidor esta vivo.
    if (req.method === 'GET' && partes[0] === 'salud') {
      return responder(res, 200, { ok: true, salas: salas.size });
    }

    if (partes[0] !== 'salas') return responder(res, 404, { motivo: 'No existe.' });

    let cuerpo;
    if (req.method === 'POST') {
      try {
        cuerpo = await leerCuerpo(req);
      } catch (error) {
        controlarRitmo(ip, true, ipFisica);
        // Ojo: no mirar req.destroyed. Node destruye el stream del pedido apenas
        // termina de leerlo, asi que eso siempre da verdadero y nos dejaria sin
        // contestar. Lo que importa es si la respuesta todavia se puede escribir.
        if (res.writableEnded || res.destroyed) return undefined;
        return responder(res, error.estado ?? 400, { motivo: error.message });
      }
    }

    // --- Crear sala: POST /salas ---
    if (req.method === 'POST' && partes.length === 1) {
      const ritmo = controlarRitmo(ip, false, ipFisica);
      if (!ritmo.permitido) return responder(res, 429, { motivo: ritmo.motivo });

      if (!pareceConexion(cuerpo.oferta)) {
        return responder(res, 400, { motivo: 'La invitacion no trae una conexion valida.' });
      }

      if (salas.size >= SALAS_MAXIMAS) {
        // Antes de rechazar, sacamos lo que ya vencio: puede alcanzar.
        barrer();
        if (salas.size >= SALAS_MAXIMAS) {
          return responder(res, 503, { motivo: 'El servidor esta lleno. Proba de nuevo en un rato.' });
        }
      }

      let codigo;
      if (cuerpo.codigo !== undefined && cuerpo.codigo !== '') {
        const revisado = validarPersonalizado(cuerpo.codigo);
        if (!revisado.ok) return responder(res, 400, { motivo: revisado.motivo });
        if (salas.has(revisado.codigo)) {
          return responder(res, 409, { motivo: 'Ese codigo ya esta en uso. Elegi otro.' });
        }
        codigo = revisado.codigo;
      } else {
        codigo = codigoLibre();
        if (codigo === null) {
          return responder(res, 503, { motivo: 'No se pudo generar un codigo. Proba de nuevo.' });
        }
      }

      salas.set(codigo, { oferta: cuerpo.oferta, respuesta: null, creada: ahora() });
      return responder(res, 201, { codigo, vence: ahora() + VIDA_DE_LA_SALA });
    }

    const revisado = partes.length >= 2 ? validarParaEntrar(partes[1]) : { ok: false };
    if (!revisado.ok) return responder(res, 404, { motivo: 'No existe.' });
    const codigo = revisado.codigo;
    const sala = salas.get(codigo);

    // --- Entrar a la sala: GET /salas/CODIGO ---
    if (req.method === 'GET' && partes.length === 2) {
      const ritmo = controlarRitmo(ip, sala === undefined, ipFisica);
      if (!ritmo.permitido) return responder(res, 429, { motivo: ritmo.motivo });
      if (!sala) return responder(res, 404, { motivo: 'No hay ninguna sala con ese codigo.' });
      if (sala.respuesta !== null) {
        return responder(res, 409, { motivo: 'Alguien ya entro a esa sala.' });
      }
      return responder(res, 200, { oferta: sala.oferta });
    }

    // --- Contestar: POST /salas/CODIGO/respuesta ---
    if (req.method === 'POST' && partes.length === 3 && partes[2] === 'respuesta') {
      const ritmo = controlarRitmo(ip, sala === undefined, ipFisica);
      if (!ritmo.permitido) return responder(res, 429, { motivo: ritmo.motivo });
      if (!sala) return responder(res, 404, { motivo: 'Esa sala ya no existe.' });
      if (sala.respuesta !== null) {
        return responder(res, 409, { motivo: 'Alguien ya entro a esa sala.' });
      }
      if (!pareceConexion(cuerpo.respuesta)) {
        return responder(res, 400, { motivo: 'La respuesta no trae una conexion valida.' });
      }
      sala.respuesta = cuerpo.respuesta;
      return responder(res, 200, { ok: true });
    }

    // --- El anfitrion espera la respuesta: GET /salas/CODIGO/respuesta ---
    if (req.method === 'GET' && partes.length === 3 && partes[2] === 'respuesta') {
      const ritmo = controlarRitmo(ip, false, ipFisica);
      if (!ritmo.permitido) return responder(res, 429, { motivo: ritmo.motivo });
      if (!sala) return responder(res, 404, { motivo: 'Esa sala ya no existe.' });
      if (sala.respuesta === null) return responder(res, 200, { esperando: true });

      // Ya se encontraron: la sala no hace falta mas.
      salas.delete(codigo);
      return responder(res, 200, { esperando: false, respuesta: sala.respuesta });
    }

    // --- Cancelar: DELETE /salas/CODIGO ---
    if (req.method === 'DELETE' && partes.length === 2) {
      salas.delete(codigo);
      return responder(res, 200, { ok: true });
    }

    return responder(res, 404, { motivo: 'No existe.' });
  });

  // Que una conexion lenta o a medio mandar no se quede colgada para siempre.
  servidor.requestTimeout = ESPERA_DE_PEDIDO;
  servidor.headersTimeout = ESPERA_DE_PEDIDO;
  servidor.keepAliveTimeout = 30_000;

  const reloj = setInterval(barrer, BARRIDO);
  // Que el barrido no impida que el proceso termine cuando corresponde.
  if (typeof reloj.unref === 'function') reloj.unref();

  servidor.on('close', () => clearInterval(reloj));

  // Expuestos para los tests.
  servidor.salas = salas;
  servidor.barrer = barrer;

  return servidor;
}

module.exports = {
  CUERPO_MAXIMO,
  ESPERA_DE_PEDIDO,
  PEDIDOS_POR_MINUTO_POR_CONEXION,
  SALAS_MAXIMAS,
  ERRORES_POR_MINUTO,
  PEDIDOS_POR_MINUTO,
  TOPE_DURO,
  VIDA_DE_LA_SALA,
  crearServidor,
};
