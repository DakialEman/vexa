# Vexa

> quiero ver peliculas y series con mi amigo simultaneamente

*Brief generado por Solo el 02/09/2026. Editalo a mano: es tuyo.*

## 1. Que es

- **Tipo:** Aplicacion de escritorio con ventana
- **Para quien:** para mi y mi amigo
- **Problema que resuelve:** quiero ver peliculas y series con mi amigo simultaneamente
- **Corre en:** mi pc

## 2. Alcance

### Si va a hacer
- Tener un navegador dentro que deje buscar en internet y se vea simultaneamente lo que yo estoy haciendo en la pantalla a mi y a mi amigo

### No va a hacer (por ahora)
- no anuncios en el navegador
- no dilay

## 3. Stack tecnico

**Electron + HTML/CSS/JS**

Rapido de hacer si venis del web, pero cada ventana arranca en ~200 MB de RAM. Pensalo dos veces si la maquina es justa.

- **Almacenamiento:** Base en servidor (PostgreSQL, MySQL, Mongo)
- **Necesita internet:** si
- **Tiene usuarios/login:** no
- **Como se ejecuta:** `npm start`
- **Como se distribuye:** electron-builder

**Dependencias base:**
- `electron`

**Opcionales, solo si hacen falta:**
- electron-builder

## 4. Estructura propuesta

```
vexa/
  main.js
  package.json
  preload.js
  renderer/app.js
  renderer/index.html
  README.md
  .gitignore
```

## 5. Modelo de datos

Entidades principales *(completar campos):*
- **Usuario**: id, …
- **pagina-elegida**: id, …
- **id-usaurio**: id, …
- **correo**: id, …

Base en servidor: definí las migraciones desde el primer dia y no toques el esquema a mano en produccion.

## 6. Orden de trabajo

1. Ventana vacia que abre y cierra bien
2. La logica central, sin interfaz, testeada aparte
3. Conectar la interfaz a la logica
4. Guardar y cargar la configuracion del usuario
5. Empaquetado a ejecutable

## 7. Riesgos y decisiones a tomar temprano

- Separá la logica de la interfaz desde el dia uno: si no, no vas a poder testear nada.
- Decidí donde guardas la config del usuario antes de escribir la primera pantalla.
- Definí que pasa cuando no hay red: reintentos, timeout y mensaje claro.

## 8. Preguntas que conviene responder antes de escribir codigo

- **¿Que pasa si falla?** — Definí el comportamiento ante error antes de programar el camino feliz.
- **¿Como sabes que funciona?** — Escribí al menos un test del caso central.
- **¿Que NO va a hacer?** — El alcance que descartas explicitamente es lo que te salva de no terminar nunca.
- **¿Quien lo mantiene en 6 meses?** — Si sos vos, el README tiene que alcanzarte para volver a entenderlo.

## 9. Notas

necesito que tenga sincronia lo que yo veo y lo que mi amigo ve
