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

Para verificar sin manos que la app arranca y cierra bien:

```bash
VEXA_SMOKE=1 npm start
```

Abre la ventana, imprime `[vexa] Ventana lista.` y sale con codigo 0.

## Estructura

```
vexa/
  main.js              proceso principal: ventana, ciclo de vida, errores
  preload.js           puente seguro entre el proceso principal y la interfaz
  renderer/index.html  interfaz (siempre oscura)
  renderer/app.js      logica de la interfaz
```

## Estado

Punto 1 del plan terminado: **la ventana abre y cierra bien.**

Hecho:

- Ventana de 1100x720 en modo oscuro, sin flash blanco al abrir.
- Una sola instancia a la vez (si abris Vexa de nuevo, enfoca la que ya esta).
- Aislamiento activado (`contextIsolation`, `sandbox`, sin Node en la interfaz).
- Los errores no se tragan: fallo de carga, proceso caido y excepciones sueltas
  se avisan por consola y en pantalla, y la app sale con codigo 1.
- Los links externos abren en el navegador del sistema, no dentro de Vexa.

Falta (ver `BRIEF.md` para el plan completo): el navegador interno, la conexion
con el amigo, el traspaso de control y el instalador.
