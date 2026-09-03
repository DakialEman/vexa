'use strict';

// Arranque del servidor de encuentro de Vexa.
// En un hosting gratuito (Render, Fly, Railway) el puerto llega en PORT.

const { crearServidor } = require('./salas.js');

const PUERTO = Number(process.env.PORT) || 8787;

const servidor = crearServidor();

servidor.listen(PUERTO, () => {
  console.log(`[vexa] Servidor de encuentro escuchando en el puerto ${PUERTO}.`);
});

servidor.on('error', (error) => {
  console.error(`[vexa] El servidor no pudo arrancar: ${error.message}`);
  process.exit(1);
});

// Que un apagado del hosting no corte conexiones a la mitad.
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    console.log(`[vexa] Apagando por ${senal}.`);
    servidor.close(() => process.exit(0));
  });
}
