#!/bin/bash
# Corre TODAS las pruebas de Vexa, de la logica a dos apps conectandose de
# verdad, y resume que anduvo y que no.
#
#   test/probar-todo.sh
#
# Necesita un servidor de encuentro y unas paginas de prueba corriendo en
# local; si no estan, se saltean las pruebas que las necesitan y se avisa.

set -u
cd "$(dirname "$0")/.."

SERVIDOR="${VEXA_SERVIDOR_PRUEBA:-http://127.0.0.1:8790}"
PAGINA="${VEXA_PAGINA_PRUEBA:-http://127.0.0.1:8124/peli}"
PAGINA2="${VEXA_PAGINA2_PRUEBA:-http://127.0.0.1:8130/}"
PAGINA_ANUNCIOS="${VEXA_PAGINA_ANUNCIOS:-http://127.0.0.1:8125/peli}"

BIEN=0
MAL=0
SALTEADAS=0
RESUMEN=""

anotar() {
  local estado="$1" nombre="$2"
  case "$estado" in
    bien) BIEN=$((BIEN + 1)); RESUMEN="$RESUMEN\n  OK      $nombre" ;;
    mal) MAL=$((MAL + 1)); RESUMEN="$RESUMEN\n  FALLO   $nombre" ;;
    salteada) SALTEADAS=$((SALTEADAS + 1)); RESUMEN="$RESUMEN\n  salteada $nombre" ;;
  esac
}

hay() { curl -s -m 3 -o /dev/null "$1" 2>/dev/null; }

# Corre la app en modo prueba y mira si salio bien.
en_la_app() {
  local nombre="$1"; shift
  echo "--- $nombre ---"
  if env "$@" VEXA_SMOKE=1 timeout 240 xvfb-run -a npx electron . --no-sandbox 2>&1 \
      | grep -E "^\[vexa\]( +[a-z]|.*(anduvo|fallo|error))" ; then :; fi
  local salida=${PIPESTATUS[0]}
  [ "$salida" -eq 0 ] && anotar bien "$nombre" || anotar mal "$nombre"
  echo
}

echo "======================================"
echo "  Probando Vexa entera"
echo "======================================"
echo

echo "--- 1. Logica (sin abrir ventanas) ---"
if npm test 2>&1 | tail -8 | grep -E "^# (tests|pass|fail)"; then :; fi
if npm test > /dev/null 2>&1; then anotar bien "logica"; else anotar mal "logica"; fi
echo

en_la_app "2. La ventana abre y cierra"
en_la_app "3. La pantalla y sus botones" VEXA_SMOKE_PANEL=1
en_la_app "4. Caida de la conexion" VEXA_SMOKE_CAIDA=1

if hay "$PAGINA"; then
  en_la_app "5. Navegar a una pagina" VEXA_SMOKE_URL="$PAGINA"
  en_la_app "7. Traspaso de control" VEXA_SMOKE_CONTROL=1 VEXA_SMOKE_URL="$PAGINA"
else
  echo "(sin pagina de prueba en $PAGINA: salteo navegacion y control)"; echo
  anotar salteada "navegar"; anotar salteada "traspaso de control"
fi

if hay "$PAGINA" && hay "$SERVIDOR/salud"; then
  en_la_app "6. Sesion por el servidor" VEXA_SMOKE_SESION=1 VEXA_SERVIDOR="$SERVIDOR" VEXA_SMOKE_URL="$PAGINA"
else
  echo "(sin servidor en $SERVIDOR: salteo la sesion)"; echo
  anotar salteada "sesion por el servidor"
fi

if hay "$PAGINA_ANUNCIOS"; then
  en_la_app "8. Bloqueo de anuncios" VEXA_SMOKE_ANUNCIOS=1 VEXA_SMOKE_URL="$PAGINA_ANUNCIOS"
else
  echo "(sin pagina con anuncios: salteo el bloqueo)"; echo
  anotar salteada "bloqueo de anuncios"
fi

if hay "$SERVIDOR/salud" && hay "$PAGINA"; then
  echo "--- 9. Dos Vexa conectandose de verdad ---"
  if bash test/probar-de-a-dos.sh "$SERVIDOR" "$PAGINA" "$PAGINA2" 2>&1 | tail -22; then :; fi
  [ "${PIPESTATUS[0]}" -eq 0 ] && anotar bien "de a dos" || anotar mal "de a dos"
  echo
else
  echo "(sin servidor: salteo la prueba de a dos)"; echo
  anotar salteada "de a dos"
fi

echo "======================================"
echo "  Resumen"
echo "======================================"
printf "%b\n" "$RESUMEN"
echo
echo "  $BIEN bien, $MAL mal, $SALTEADAS salteadas"
[ "$MAL" -eq 0 ] && exit 0 || exit 1
