# Vexa

Ver peliculas y series en simultaneo con un amigo, desde una sola app de escritorio.

## Idea

Vexa tiene un navegador propio adentro. Vos buscas y navegas normal (por ejemplo,
entras a un sitio de peliculas y le das play) y tu amigo ve lo mismo que vos, al
mismo tiempo, sin tener que hacer nada de su lado. El control lo tenes vos, y se
puede pasar al otro cuando haga falta.

No es compartir la pantalla de la computadora: lo unico que viaja es el navegador
interno de Vexa. Tampoco hace falta estar en la misma red ni usar Hamachi.

## Como se ejecuta

```bash
npm install
npm start
```

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
```

Sale con codigo 0 si todo anduvo y 1 si algo fallo.

## Como se instala

Para armar el instalador de Windows, desde una maquina con Windows:

```bash
npm run dist
```

Deja `dist/Vexa-0.1.0-instalador.exe`. Ese archivo se copia a las dos
computadoras y se instala como cualquier programa: pregunta donde instalarlo y
deja el acceso directo en el escritorio y en el menu de inicio.

Para probar el empaquetado sin armar el instalador:

```bash
npm run empaquetar   # deja la app suelta en dist/
```

> El instalador de Windows hay que armarlo **en Windows**. Desde Linux
> electron-builder necesita wine para hacerlo.

## Estructura

```
vexa/
  main.js                 proceso principal: ventana, navegador interno, captura
  preload.js              puente seguro entre el proceso principal y la interfaz
  src/navegacion.js       logica de navegacion, sin interfaz (se testea sola)
  src/sesion.js           codigos de invitacion (comprimir, leer, validar)
  src/control.js          traduccion de los mandos que manda el espectador
  src/anuncios.js         que pedidos se bloquean por publicidad o rastreo
  build/generar-icono.js  dibuja build/icon.png (solo si hay que rehacerlo)
  test/*.test.js          tests de esa logica
  test/prueba-sesion-en-vivo.js  prueba de la conexion real, corre dentro de la app
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
- Para encontrarse **no hace falta ningun servidor**: uno genera un codigo, se
  lo pasa por chat, el otro lo pega y devuelve el suyo. Los codigos van
  comprimidos y aguantan que el chat los corte en varias lineas.
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
  antes de que salgan de la maquina. La lista esta en `src/anuncios.js` y se
  amplia agregando dominios ahi.
- La regla es conservadora a proposito: se bloquea por dominio y nunca lo que
  sirve la propia pagina, porque ahi vive el reproductor. Preferimos dejar
  pasar un anuncio antes que romper una pelicula.
- Las ventanas emergentes se siguen bloqueando aparte, con el boton para abrir
  la ultima por si era el reproductor de verdad.
- La barra cuenta cuantos bloqueos hubo en la pagina actual.

**Empaquetado:** listo, con icono propio y instalador de Windows con pasos
(ver "Como se instala").

## Limites conocidos

- **Hay retraso.** Entre 0,2 y 0,5 segundos. Es constante, asi que se ve la peli
  igual, pero no es cero: eso solo se logra si cada uno carga el video por su
  lado, que es justo lo que Vexa no hace.
- **Los codigos son largos** (unos 2 KB). Se pegan bien en WhatsApp, pero no son
  lindos. Un servidor de encuentro chiquito los reemplazaria por un link.
- **Si el proveedor de internet usa CGNAT**, la conexion directa puede no
  armarse. Ahi haria falta un servidor de reenvio (TURN) como respaldo.
- **El bloqueo de anuncios es una lista propia**, no un uBlock. Corta lo mas
  comun; algun anuncio de una red que no este en la lista va a pasar. Se
  arregla agregando el dominio en `src/anuncios.js`.
