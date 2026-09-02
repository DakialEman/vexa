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
```

Sale con codigo 0 si todo anduvo y 1 si algo fallo.

## Estructura

```
vexa/
  main.js                 proceso principal: ventana, navegador interno, captura
  preload.js              puente seguro entre el proceso principal y la interfaz
  src/navegacion.js       logica de navegacion, sin interfaz (se testea sola)
  src/sesion.js           codigos de invitacion (comprimir, leer, validar)
  test/*.test.js          tests de esa logica
  test/prueba-sesion-en-vivo.js  prueba de la conexion real, corre dentro de la app
  renderer/index.html     barra, pantallas y panel de sesion (siempre oscuros)
  renderer/app.js         logica de la interfaz
  renderer/conexion.js    conexion en vivo con el amigo (WebRTC)
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

Falta (ver `BRIEF.md` para el plan completo): el traspaso de control, el
bloqueo de anuncios y el instalador.

## Limites conocidos

- **Hay retraso.** Entre 0,2 y 0,5 segundos. Es constante, asi que se ve la peli
  igual, pero no es cero: eso solo se logra si cada uno carga el video por su
  lado, que es justo lo que Vexa no hace.
- **Los codigos son largos** (unos 2 KB). Se pegan bien en WhatsApp, pero no son
  lindos. Un servidor de encuentro chiquito los reemplazaria por un link.
- **Si el proveedor de internet usa CGNAT**, la conexion directa puede no
  armarse. Ahi haria falta un servidor de reenvio (TURN) como respaldo.
