#!/usr/bin/env bash
# Servidor local de recorte de fondos (rembg + BiRefNet) para la app.
# La app lo usa automáticamente cuando está corriendo; si no, cae al modelo
# del navegador. Puerto 7001 porque el 7000 lo ocupa AirPlay en macOS.
#
# Instalación (una sola vez):
#   python3.11 -m venv ~/.rembg-venv
#   ~/.rembg-venv/bin/pip install "rembg[cpu,cli]" fastapi uvicorn python-multipart
#
# Modelo por defecto: birefnet-portrait (el más preciso para fotos de jugador).
# La app puede pedir otro modelo por petición (birefnet-massive, etc.).
set -euo pipefail

VENV="$HOME/.rembg-venv"
if [ ! -x "$VENV/bin/python" ]; then
  echo "No se encontró rembg en ~/.rembg-venv. Instálalo con:"
  echo '  python3.11 -m venv ~/.rembg-venv && ~/.rembg-venv/bin/pip install "rembg[cpu,cli]" fastapi uvicorn python-multipart'
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$VENV/bin/python" -m uvicorn bg-server:app --app-dir "$SCRIPT_DIR" --port 7001 --log-level warning
