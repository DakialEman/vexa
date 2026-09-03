# Servidor de encuentro de Vexa

Junta a las dos computadoras y despues se hace a un lado.

## Que hace, exactamente

Cuando abris una sala, Vexa le manda a este servidor los datos que tu amigo
necesita para encontrarte, y el servidor los guarda bajo un codigo corto
(`4K7-M9P`). Cuando tu amigo escribe ese codigo, se los entrega, guarda su
respuesta para vos, y borra todo.

**El video nunca pasa por aca.** Va directo entre las dos computadoras. Este
servidor solo maneja unos kilobytes, durante menos de un minuto, al principio
de cada sesion. Por eso entra sobrado en cualquier plan gratuito.

Tampoco guarda historial: no hay base de datos, todo vive en memoria y se borra
a los 10 minutos.

## Como se prueba en tu propia maquina

```bash
node servidor/index.js
```

Queda escuchando en el puerto 8787. En Vexa, en Ajustes, se pone
`http://localhost:8787`. Sirve para probar entre dos computadoras de la misma
casa, pero no para conectarte con alguien de afuera: para eso hay que
publicarlo.

## Como se publica gratis

### Render, a mano (el camino seguro)

1. Entra a [render.com](https://render.com) y crea una cuenta.
2. **New > Web Service**, y conecta tu cuenta de GitHub cuando te lo pida.
3. Elegi el repositorio `vexa`.
4. Llena asi:

   | Campo | Valor |
   | --- | --- |
   | Branch | la rama donde esta el codigo |
   | Language / Runtime | `Node` |
   | Build Command | `echo ok` |
   | Start Command | `node servidor/index.js` |
   | Instance Type | `Free` |

   El **Build Command** es importante: si se deja el `npm install` que viene por
   defecto, Render se baja Electron entero al servidor sin ninguna necesidad.

5. **Create Web Service**. Cuando termine te queda una direccion tipo
   `https://vexa-encuentro.onrender.com`.
6. Para comprobar que anda, abri esa direccion con `/salud` al final. Tiene que
   contestar `{"ok":true,"salas":0}`.
7. Esa direccion va en **Ajustes** de Vexa, en las dos computadoras.

### Render, con el Blueprint

En el menu **Blueprints** de Render, eligiendo este repositorio: lee el
`render.yaml` de la raiz y arma todo solo, sin llenar nada a mano.

Un detalle del plan gratuito: si nadie lo usa por un rato, Render lo apaga, y
el primer pedido despues tarda unos 30 segundos en despertarlo. Si al abrir una
sala parece colgado la primera vez, es eso: se reintenta y anda.

### Cualquier otro lado

No tiene dependencias, asi que corre en cualquier lugar con Node 18 o mas:

```bash
PORT=8787 node servidor/index.js
```

Fly.io, Railway, un VPS o una Raspberry en tu casa sirven igual.

## Que expone

| Camino | Que hace |
| --- | --- |
| `POST /salas` | Abre una sala. Devuelve el codigo. |
| `GET /salas/CODIGO` | Trae la invitacion de esa sala. |
| `POST /salas/CODIGO/respuesta` | Deja la respuesta de quien entra. |
| `GET /salas/CODIGO/respuesta` | El anfitrion pregunta si ya entraron. |
| `DELETE /salas/CODIGO` | Cancela la sala. |
| `GET /salud` | Para saber si esta vivo. |

## Que tan seguro es

- Los codigos que genera son de 6 caracteres sobre un alfabeto de 31: casi
  900 millones de combinaciones.
- Probar codigos a lo bruto queda frenado a los 20 errados por minuto.
- Una sala se usa **una sola vez**: apenas alguien entra, se borra.
- Las salas sin usar se borran a los 10 minutos.
- Los codigos elegidos a mano (`pepe-y-yo`) son faciles de adivinar. Eso es
  decision de quien lo elige: si alguien acierta el codigo mientras la sala
  esta abierta, puede entrar. Para algo que dura minutos y se usa una vez, es
  un riesgo chico, pero conviene saberlo.
