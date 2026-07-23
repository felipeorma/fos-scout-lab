#!/usr/bin/env bash
# Servidor local de recorte de fondos (rembg + BiRefNet portrait).
# La app lo usa automáticamente cuando está corriendo; si no, cae al modelo
# del navegador. Puerto 7001 porque el 7000 lo ocupa AirPlay en macOS.
#
# Instalación (una sola vez):
#   python3.11 -m venv ~/.rembg-venv
#   ~/.rembg-venv/bin/pip install "rembg[cpu,cli]"
set -euo pipefail

REMBG="$HOME/.rembg-venv/bin/rembg"
if [ ! -x "$REMBG" ]; then
  echo "No se encontró rembg en ~/.rembg-venv. Instálalo con:"
  echo '  python3.11 -m venv ~/.rembg-venv && ~/.rembg-venv/bin/pip install "rembg[cpu,cli]"'
  exit 1
fi

# BROWSER=true evita que rembg abra una pestaña del navegador al arrancar.
exec env BROWSER=true "$REMBG" s --port 7001 --log_level warning
