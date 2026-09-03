#!/bin/bash
# Levanta DOS Vexa de verdad, en dos procesos, y las hace conectarse por el
# servidor: una abre la sala y la otra entra con el codigo. Es lo mas parecido
# a dos amigos en dos computadoras que se puede hacer en una sola maquina.
#
#   test/probar-de-a-dos.sh [direccion-del-servidor] [pagina-a-abrir]

set -u

SERVIDOR="${1:-http://127.0.0.1:8790}"
PAGINA="${2:-http://127.0.0.1:8124/peli}"
OTRA_PAGINA="${3:-http://127.0.0.1:8130/}"
TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT

echo "servidor: $SERVIDOR"
echo "pagina:   $PAGINA"
echo

if ! curl -s -m 10 "$SERVIDOR/salud" > /dev/null; then
  echo "FALLO: el servidor no contesta en $SERVIDOR"
  exit 1
fi

# --- El anfitrion abre la sala y queda esperando ---
echo "--- levantando el anfitrion ---"
VEXA_VARIAS=1 VEXA_SMOKE=1 VEXA_SMOKE_ROL=anfitrion \
  VEXA_SERVIDOR="$SERVIDOR" VEXA_SMOKE_URL="$PAGINA" VEXA_SMOKE_URL2="$OTRA_PAGINA" \
  xvfb-run -a npx electron . --no-sandbox --user-data-dir="$TRABAJO/anfitrion" \
  > "$TRABAJO/anfitrion.log" 2>&1 &
PID_ANFITRION=$!

# Esperamos a que publique su codigo.
CODIGO=""
for _ in $(seq 1 60); do
  CODIGO=$(grep -oE 'VEXA_CODIGO=[A-Z0-9]{6}' "$TRABAJO/anfitrion.log" 2>/dev/null | head -1 | cut -d= -f2)
  [ -n "$CODIGO" ] && break
  kill -0 "$PID_ANFITRION" 2>/dev/null || break
  sleep 1
done

if [ -z "$CODIGO" ]; then
  echo "FALLO: el anfitrion no llego a abrir una sala"
  grep -E "^\[vexa\]|fallo" "$TRABAJO/anfitrion.log" | tail -10
  kill "$PID_ANFITRION" 2>/dev/null
  exit 1
fi

echo "el anfitrion abrio la sala: $CODIGO"
echo

# --- El espectador entra con ese codigo, escrito como lo escribiria una persona ---
COMO_LO_ESCRIBE="$(echo "${CODIGO:0:3}-${CODIGO:3}" | tr 'A-Z' 'a-z')"
echo "--- el espectador entra escribiendo \"$COMO_LO_ESCRIBE\" ---"

VEXA_VARIAS=1 VEXA_SMOKE=1 VEXA_SMOKE_ROL=espectador VEXA_SMOKE_CODIGO="$COMO_LO_ESCRIBE" \
  VEXA_SERVIDOR="$SERVIDOR" VEXA_SMOKE_URL2="$OTRA_PAGINA" \
  timeout 240 xvfb-run -a npx electron . --no-sandbox --user-data-dir="$TRABAJO/espectador" \
  > "$TRABAJO/espectador.log" 2>&1
SALIDA_ESPECTADOR=$?

wait "$PID_ANFITRION" 2>/dev/null
SALIDA_ANFITRION=$?

echo
echo "--- lo que vio el anfitrion ---"
grep -E "^\[vexa\]" "$TRABAJO/anfitrion.log" | grep -vE "Servidor de encuentro|pide las paginas|Ventana lista"
echo
echo "--- lo que vio el espectador ---"
grep -E "^\[vexa\]" "$TRABAJO/espectador.log" | grep -vE "Servidor de encuentro|pide las paginas|Ventana lista"
echo
echo "anfitrion salio con $SALIDA_ANFITRION, espectador con $SALIDA_ESPECTADOR"

if [ "$SALIDA_ANFITRION" -eq 0 ] && [ "$SALIDA_ESPECTADOR" -eq 0 ]; then
  echo "DE A DOS: ANDUVO"
  exit 0
fi

echo "DE A DOS: FALLO"
exit 1
