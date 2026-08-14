"""Servidor local de recorte de fondos para Felipe Ormazabal Scouting.

Usa rembg como librería con los modelos BiRefNet (los más precisos) y añade
lo que al servidor estándar de rembg le falta:

- Header `Access-Control-Allow-Private-Network` para que el sitio publicado
  en GitHub Pages (https) pueda llamar a este servidor local desde Chrome.
- Modelo elegible por petición (campo `model`), con sesiones cacheadas.
- Respuesta con el header `X-Bg-Engine` para saber qué modelo procesó la foto.

Arranque: npm run bg:server  (o: ~/.rembg-venv/bin/uvicorn bg-server:app)
"""

import io

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import PlainTextResponse, Response
from PIL import Image
from rembg import new_session, remove

app = FastAPI()

DEFAULT_MODEL = "birefnet-portrait"
# Si el recorte principal falla de forma evidente (borra casi todo o casi
# nada), se reintenta con el generalista más potente.
RESCUE_MODEL = "birefnet-general"
ALLOWED_MODELS = {
    "birefnet-portrait",
    "birefnet-general",
    "birefnet-general-lite",
    "birefnet-massive",
    "isnet-general-use",
    "u2net_human_seg",
    "u2net",
}
_sessions = {}


def session_for(model: str):
    if model not in _sessions:
        _sessions[model] = new_session(model)
    return _sessions[model]


def cors_headers(extra=None):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        # Chrome exige este header para permitir que una página pública
        # (GitHub Pages) hable con un servidor de la red local.
        "Access-Control-Allow-Private-Network": "true",
    }
    if extra:
        headers.update(extra)
    return headers


@app.options("/{path:path}")
async def preflight(path: str):
    return PlainTextResponse("", headers=cors_headers())


@app.get("/api/health")
async def health():
    return Response('{"ok": true}', media_type="application/json", headers=cors_headers())


def foreground_ratio(png_bytes: bytes) -> float:
    """Fracción de la imagen que quedó visible tras el recorte."""
    image = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    histogram = image.getchannel("A").histogram()
    visible = sum(histogram[16:])
    return visible / float(image.width * image.height)


@app.post("/api/remove")
async def remove_background(
    file: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
    post_process: bool = Form(False),
):
    chosen = model if model in ALLOWED_MODELS else DEFAULT_MODEL
    payload = await file.read()
    result = remove(payload, session=session_for(chosen), post_process_mask=post_process)
    engine = chosen

    # Rescate: un recorte que deja <5% o >98% de la imagen visible es un
    # fallo evidente; se reintenta con el modelo generalista y se entrega el
    # resultado más plausible.
    try:
        ratio = foreground_ratio(result)
        if (ratio < 0.05 or ratio > 0.98) and chosen != RESCUE_MODEL:
            rescued = remove(payload, session=session_for(RESCUE_MODEL), post_process_mask=post_process)
            rescued_ratio = foreground_ratio(rescued)
            # Solo se reemplaza si el rescate cae en la banda plausible; si
            # ambos fallan se conserva el original (una imagen intacta al 99%
            # es mejor que una casi vacía al 1%).
            if 0.05 <= rescued_ratio <= 0.98:
                result = rescued
                engine = f"{RESCUE_MODEL} (rescate)"
    except Exception:
        pass

    return Response(
        result,
        media_type="image/png",
        headers=cors_headers({"X-Bg-Engine": engine}),
    )
