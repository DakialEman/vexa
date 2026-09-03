# Vexa

Ver peliculas y series en simultaneo con un amigo, desde una sola app de escritorio.

## Idea

Vexa tiene un navegador propio adentro. Vos buscas y navegas normal (por ejemplo,
entras a un sitio de peliculas y le das play) y tu amigo ve lo mismo que vos, al
mismo tiempo, sin tener que hacer nada de su lado. El control lo tenes vos, y se
puede pasar al otro cuando haga falta.

No es compartir la pantalla de la computadora: lo unico que viaja es el navegador
interno de Vexa. Tampoco hace falta estar en la misma red ni usar Hamachi.

Para verlo juntos, uno abre una sala y le pasa un codigo corto (`4K7-M9P`). El
otro lo escribe y entra. Nada mas.

## Como se ejecuta

```bash
npm install
npm start
```

La primera vez hay que decirle a Vexa cual es su **servidor de encuentro**, en
el boton Ajustes del panel "Ver juntos". Ese servidor esta en `servidor/` de
este mismo proyecto y se publica gratis: ver `servidor/README.md`. Tiene que
ser el mismo en las dos computadoras.

## Como se prueba

```bash
npm test
```

Corre los tests de la logica (navegacion y codigos de invitacion), sin abrir
ninguna ventana.

Para probar la app entera sin tocar nada:

```bash
# solo abre y cierra la ventana
VEXA_SMOKE=1 npm start

# ademas navega y confirma que la pagina cargo
VEXA_SMOKE=1 VEXA_SMOKE_URL=https://example.com npm start

# ademas captura el navegador, conecta las dos puntas y confirma que llega video
VEXA_SMOKE=1 VEXA_SMOKE_SESION=1 VEXA_SMOKE_URL=https://example.com npm start

# comprueba que un mando del espectador llegue de verdad a la pagina
VEXA_SMOKE=1 VEXA_SMOKE_CONTROL=1 VEXA_SMOKE_URL=https://example.com npm start

# comprueba que la publicidad quede afuera y lo demas entre
VEXA_SMOKE=1 VEXA_SMOKE_ANUNCIOS=1 VEXA_SMOKE_URL=https://example.com npm start

# aprieta los botones de la pantalla, como lo haria una persona
VEXA_SMOKE=1 VEXA_SMOKE_PANEL=1 npm start
```

La prueba de la pantalla ademas **falla si la pantalla tira cualquier error**,
aunque los botones parezcan andar. Existe por un motivo concreto: alcanza un
`ReferenceError` al arrancar para que no se conecte ni un boton, y desde afuera
eso se ve como "aprieto y no pasa nada".

Sale con codigo 0 si todo anduvo y 1 si algo fallo.

## Como se instala

Para armar el instalador de Windows, desde una maquina con Windows:

```bash
npm run dist
```

Deja dos archivos, y alcanza con cualquiera de los dos:

- `dist/Vexa-0.1.0-instalador.exe` — se instala como cualquier programa:
  pregunta donde ponerlo y deja los accesos directos.
- `dist/Vexa-0.1.0-portable.exe` — no se instala: se abre y listo. Util para
  probarlo o para llevarlo en un pendrive. La primera vez tarda unos segundos
  mas porque se descomprime solo.

Para probar el empaquetado sin armar el instalador:

```bash
npm run empaquetar   # deja la app suelta en dist/
```

Deja tambien `dist/Vexa-0.1.0-instalador.exe.blockmap` y `latest.yml`, que
sirven para actualizaciones automaticas mas adelante. Por ahora se pueden
ignorar.

### Armarlo desde Linux

Se puede, pero electron-builder necesita wine con soporte de 32 bits (NSIS
compila el desinstalador corriendo un ejecutable de 32 bits). En Ubuntu 24.04:

```bash
dpkg --add-architecture i386
apt-get update
apt-get install -y --no-install-recommends wine wine64 wine32:i386
rm -rf ~/.wine && wineboot -u          # el prefijo se crea con los dos
npm run dist
```

Si al instalar `wine32:i386` apt se queja de `libgd3`, es porque esta buscando
una version de un repositorio de terceros. Se resuelve fijando la del repo
oficial: `apt-get install -y libgd3=2.3.3-9ubuntu5`.

### Si hay que partir el instalador para mandarlo

Pesa casi 100 MB, asi que a veces hay que partirlo. Si se hace, conviene que
los pedazos **no** terminen en `.exe`: el primer pedazo de un instalador NSIS
empieza igual que un ejecutable de verdad, Windows lo muestra como programa, y
si alguien le hace doble clic recibe un "Installer integrity check has failed"
que parece un archivo roto pero es solo un pedazo suelto. Con la extension
`.bin` el malentendido no puede pasar.

Para volver a unirlos alcanza con `copy /b parte1+parte2+... salida.exe`, pero
conviene verificar el SHA-256 del resultado contra el original.

### Como verificar que un instalador NSIS esta sano

NSIS guarda un CRC32 al final de sus datos. Lo que hay que saber es que **se
calcula desde el byte 512**, no desde el principio del archivo: los primeros
512 bytes son la cabecera PE, que queda afuera a proposito para que ponerle un
icono o firmarlo no invalide el chequeo.

```js
const inicio = archivo.indexOf(Buffer.from('NullsoftInst')) - 8;
const flags = archivo.readUInt32LE(inicio);          // bit 4 = sin CRC
const fin = inicio + archivo.readUInt32LE(inicio + 24);
const guardado = archivo.readUInt32LE(fin - 4);
const calculado = zlib.crc32(archivo.subarray(512, fin - 4)) >>> 0;
```

Los ejecutables `portable` vienen con el bit "sin CRC" prendido: ahi no hay
nada que verificar y no significa que esten rotos.

### Sobre el aviso de Windows

El instalador no esta firmado con un certificado (cuestan plata por año), asi
que Windows va a mostrar el cartel azul de SmartScreen la primera vez.
Se abre con "Mas informacion" y despues "Ejecutar de todas formas". Es lo
normal para cualquier programa sin firmar.

## Estructura

```
vexa/
  main.js                 proceso principal: ventana, navegador interno, captura
  preload.js              puente seguro entre el proceso principal y la interfaz
  src/navegacion.js       logica de navegacion, sin interfaz (se testea sola)
  src/sesion.js           hablar con el servidor de encuentro
  src/codigos.js          codigos de sala (generar, normalizar, validar)
  src/config.js           configuracion del usuario, guardada en disco
  src/saltar-anuncios-youtube.js  se inyecta en YouTube para saltear anuncios
  servidor/salas.js       el servidor de encuentro (sin dependencias)
  servidor/index.js       su arranque
  src/control.js          traduccion de los mandos que manda el espectador
  src/anuncios.js         que pedidos se bloquean por publicidad o rastreo
  build/generar-icono.js  dibuja build/icon.png (solo si hay que rehacerlo)
  test/*.test.js          tests de esa logica
  test/prueba-sesion-en-vivo.js  prueba de la conexion real, corre dentro de la app
  test/prueba-panel.js    prueba de la pantalla: aprieta los botones de verdad
  renderer/index.html     barra, pantallas y panel de sesion (siempre oscuros)
  renderer/app.js         logica de la interfaz
  renderer/conexion.js    conexion en vivo con el amigo (WebRTC)
  renderer/mando.js       manda el mouse y el teclado cuando tenes el control
```

La ventana tiene dos capas: arriba la barra de Vexa (interfaz propia) y abajo el
navegador interno, que es una vista aparte donde se ve la pagina. Cuando no hay
pagina abierta o cuando falla una carga, esa vista se esconde y queda a la vista
la pantalla de inicio o el cartel de error.

## Atajos

| Atajo | Que hace |
| --- | --- |
| `Ctrl` + `L` | Ir a la barra de direcciones |
| `Alt` + `←` / `→` | Atras / adelante |
| `F5` o `Ctrl` + `R` | Recargar |
| `Esc` | Detener la carga |

## Estado

Puntos 1 y 2 del plan terminados.

**Punto 1 — la ventana abre y cierra bien:**

- Ventana en modo oscuro, sin flash blanco al abrir.
- Una sola instancia a la vez (si abris Vexa de nuevo, enfoca la que ya esta).
- Aislamiento activado (`contextIsolation`, `sandbox`, sin Node en la interfaz).
- Los errores no se tragan: fallo de carga, proceso caido y excepciones sueltas
  se avisan por consola y en pantalla, y la app sale con codigo 1.

**Punto 2 — el navegador interno:**

- Barra con atras, adelante, recargar/detener, inicio y direccion.
- Escribis una direccion y la abre; escribis cualquier otra cosa y la busca.
- Solo abre paginas web: `file:`, `javascript:` y demas quedan bloqueados.
- Las ventanas emergentes se bloquean (en los sitios de peliculas son publicidad)
  y se cuentan en la barra. Si el reproductor de verdad abria una, hay un boton
  para abrir la ultima bloqueada.
- Los sitios no pueden pedir camara, microfono ni ubicacion. Pantalla completa si,
  que es lo que necesita un reproductor.
- Las descargas se cancelan: Vexa mira peliculas, no baja archivos.
- Cookies y sesiones persisten entre aperturas, como en un navegador normal.
- Si una pagina no carga, aparece un cartel con el motivo y un boton de reintentar.

**Punto 3 (primera mitad) — ver juntos:**

- El anfitrion transmite **solo el navegador interno de Vexa**, con el audio de
  esa pagina. No se transmite el escritorio, ni las otras ventanas, ni el audio
  del resto de la computadora. El anfitrion sigue escuchando la peli mientras la
  manda.
- El video va **directo entre las dos computadoras** (WebRTC). No pasa por
  ningun servidor nuestro y no hace falta estar en la misma red.
- Para encontrarse alcanza con un **codigo corto** (`4K7-M9P`): uno abre la
  sala, se lo pasa por chat, el otro lo escribe y entra. No hay que devolver
  nada. Se puede pedir un codigo propio (`pepe-y-yo`) si esta libre.
- El codigo se puede escribir como sea: con guion o sin guion, en mayusculas o
  minusculas. El alfabeto no tiene 0/O ni 1/I/L, para que no se confundan al
  dictarlo por telefono.
- Ese ida y vuelta lo hace el **servidor de encuentro** (`servidor/`), que
  guarda unos kilobytes por unos minutos y los borra. El video no pasa por ahi.
- El espectador ve el video a pantalla completa y no puede navegar: la barra le
  queda de solo lectura hasta que le pasen el control.
- Calidad apuntada a 1080p con prioridad a que sea fluido, que es lo que importa
  en una pelicula.

**Punto 3 (segunda mitad) — el traspaso de control:**

- El anfitrion presta y recupera el control con un boton. El espectador nunca
  lo toma por su cuenta.
- Con el control prestado, el espectador maneja el navegador del anfitrion:
  mouse, rueda, teclado y barra de direcciones.
- Las posiciones viajan como proporcion de la pantalla (de 0 a 1), asi que
  funciona aunque los dos tengan ventanas de distinto tamaño.
- Todo lo que llega de la otra computadora se valida antes de repetirlo
  (`src/control.js`): posiciones fuera de rango, teclas que en realidad son
  cadenas largas, modificadores inventados y ruedas absurdas se descartan.
- Al cortarse la conexion o cambiar de modo, el control siempre vuelve a su
  dueño.

**Bloqueo de anuncios:**

- Se cortan los pedidos a redes de publicidad, popunders y rastreo conocidos,
  antes de que salgan de la maquina.
- En YouTube, ademas, Vexa inyecta un guion que aprieta "Omitir" solo y, cuando
  el anuncio no se puede omitir, lo adelanta hasta el final y lo silencia. La lista esta en `src/anuncios.js` y se
  amplia agregando dominios ahi.
- La regla es conservadora a proposito: se bloquea por dominio y nunca lo que
  sirve la propia pagina, porque ahi vive el reproductor. Preferimos dejar
  pasar un anuncio antes que romper una pelicula.
- Las ventanas emergentes se siguen bloqueando aparte, con el boton para abrir
  la ultima por si era el reproductor de verdad.
- La barra cuenta cuantos bloqueos hubo en la pagina actual.

**Empaquetado:** listo, con icono propio y instalador de Windows con pasos
(ver "Como se instala"). Verificado: se armo el instalador de 106 MB, con la
app incrustada adentro, y el ejecutable empaquetado abre y navega.

## Limites conocidos

- **Hay retraso.** Entre 0,2 y 0,5 segundos. Es constante, asi que se ve la peli
  igual, pero no es cero: eso solo se logra si cada uno carga el video por su
  lado, que es justo lo que Vexa no hace.
- **Hace falta publicar el servidor de encuentro** una vez, y que las dos
  computadoras apunten al mismo. En un plan gratuito tipo Render, si estuvo un
  rato sin uso, el primer intento puede tardar medio minuto en despertarlo.
- **Si el proveedor de internet usa CGNAT**, la conexion directa puede no
  armarse. Ahi haria falta un servidor de reenvio (TURN) como respaldo.
- **El bloqueo de anuncios es una lista propia**, no un uBlock. Corta lo mas
  comun; algun anuncio de una red que no este en la lista va a pasar. Se
  arregla agregando el dominio en `src/anuncios.js`.
- **Los anuncios de YouTube son un caso aparte.** Vienen del mismo dominio que
  el video, asi que no se pueden cortar por dominio sin romper YouTube: se
  saltean desde adentro de la pagina. YouTube cambia eso cada tanto y el truco
  deja de andar hasta que se ajustan los selectores de
  `src/saltar-anuncios-youtube.js`.
