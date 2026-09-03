'use strict';

// Levanta las paginas falsas que necesitan las pruebas, y el servidor de
// encuentro. Asi test/probar-todo.sh no depende de nada montado a mano.
//
//   node test/servidores-de-prueba.js
//
// Se apaga con Ctrl+C. Cada pagina imita una situacion distinta:

const http = require('node:http');

const { crearServidor } = require('../servidor/salas.js');

const PUERTOS = {
  peli: 8124,      // una pagina con algo moviendose, que anota clics y teclas
  anuncios: 8125,  // pide recursos propios y de redes de publicidad
  pesada: 8130,    // 190 recursos, para medir velocidad
  idioma: 8140,    // devuelve el idioma que le pidio el navegador
  youtube: 8150,   // imita el reproductor de YouTube con un anuncio
  encuentro: 8790, // el servidor de salas de verdad
};

const abiertos = [];

function servir(puerto, manejador, que) {
  const s = http.createServer(manejador);
  s.listen(puerto, '127.0.0.1', () => console.log(`  ${puerto}  ${que}`));
  abiertos.push(s);
  return s;
}

// --- Una pagina con movimiento, que anota lo que le hacen ---
const PELI = `<!doctype html><meta charset="utf-8"><title>Peli de prueba</title>
<style>body{margin:0;height:100vh;background:#111;overflow:hidden}
.b{position:absolute;top:40%;width:120px;height:120px;border-radius:50%;background:#7c5cff;
animation:x 1.5s linear infinite alternate}@keyframes x{from{left:0}to{left:80%}}</style>
<div class="b"></div>
<script>
window.__vistos = [];
for (const n of ['mousemove','mousedown','mouseup','click','keydown']) {
  document.addEventListener(n, e => {
    if (window.__vistos.length < 20) window.__vistos.push(n + (e.key ? ':' + e.key : ''));
    if (n === 'click') document.title = 'clic-' + Math.round(e.clientX);
    if (n === 'keydown') document.title = 'tecla-' + e.key;
  });
}
</script>`;

servir(PUERTOS.peli, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PELI);
}, 'pagina con movimiento (clics y teclas)');

// --- Una pagina que pide publicidad ---
const CON_ANUNCIOS = `<!doctype html><meta charset="utf-8"><title>Sitio con anuncios</title>
<script>
window.__resultado = { llegaron: [], faltaron: [] };
const pedidos = [
  ['propio', 'http://127.0.0.1:${PUERTOS.anuncios}/propio.js'],
  ['popads', 'https://popads.net/loader.js'],
  ['doubleclick', 'https://www.doubleclick.net/ad.js'],
  ['taboola', 'https://cdn.taboola.com/x.js'],
];
for (const [nombre, url] of pedidos) {
  fetch(url, { mode: 'no-cors' })
    .then(() => window.__resultado.llegaron.push(nombre))
    .catch(() => window.__resultado.faltaron.push(nombre));
}
</script>`;

servir(PUERTOS.anuncios, (req, res) => {
  if (req.url === '/propio.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' });
    return res.end('// recurso propio');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(CON_ANUNCIOS);
}, 'pagina que pide publicidad');

// --- Una pagina con muchos recursos, para medir ---
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
let PESADA = '<!doctype html><meta charset="utf-8"><title>Pesada</title>';
for (let i = 0; i < 150; i += 1) PESADA += `<img src="/img${i}.png" width="4">`;
for (let i = 0; i < 40; i += 1) PESADA += `<script src="/js${i}.js"></script>`;

servir(PUERTOS.pesada, (req, res) => {
  if (req.url.endsWith('.png')) {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return res.end(PIXEL);
  }
  if (req.url.endsWith('.js')) {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    return res.end('//x');
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PESADA);
}, 'pagina con 190 recursos (para medir velocidad)');

// --- Una pagina que devuelve el idioma que le pidieron ---
servir(PUERTOS.idioma, (req, res) => {
  const idioma = req.headers['accept-language'] || '(ninguno)';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><title>idioma:${idioma}</title><h1>${idioma}</h1>`);
}, 'devuelve el idioma que le pidio el navegador');

// --- Un reproductor que imita el de YouTube con un anuncio ---
const YOUTUBE_CON_BOTON = `<!doctype html><meta charset="utf-8"><title>esperando</title>
<style>body{margin:0;background:#000}.html5-video-player{position:relative;width:100%;height:400px}</style>
<div class="html5-video-player ad-showing">
  <video class="html5-main-video" width="640" height="360"></video>
  <button class="ytp-ad-skip-button">Omitir anuncio</button>
</div>
<script>
  document.querySelector('.ytp-ad-skip-button').addEventListener('click', () => {
    document.title = 'omitido';
    document.querySelector('.html5-video-player').classList.remove('ad-showing');
  });
</script>`;

const YOUTUBE_SIN_BOTON = `<!doctype html><meta charset="utf-8"><title>esperando</title>
<div class="html5-video-player ad-showing">
  <video class="html5-main-video" width="640" height="360"></video>
</div>
<script>
  const v = document.querySelector('video');
  Object.defineProperty(v, 'duration', { get: () => 30 });
  let posicion = 0;
  Object.defineProperty(v, 'currentTime', {
    get: () => posicion,
    set: (nueva) => {
      posicion = nueva;
      if (posicion >= 29) {
        document.title = 'adelantado';
        document.querySelector('.html5-video-player').classList.remove('ad-showing');
      }
    },
  });
</script>`;

servir(PUERTOS.youtube, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(req.url.includes('sinboton') ? YOUTUBE_SIN_BOTON : YOUTUBE_CON_BOTON);
}, 'reproductor tipo YouTube con un anuncio');

// --- El servidor de encuentro de verdad ---
const encuentro = crearServidor();
encuentro.listen(PUERTOS.encuentro, '127.0.0.1', () =>
  console.log(`  ${PUERTOS.encuentro}  servidor de encuentro`));
abiertos.push(encuentro);

console.log('Servidores de prueba levantados:');

for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    for (const s of abiertos) s.close();
    process.exit(0);
  });
}
