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


# ============================================================================
# Puente de datos: StatsBomb y SkillCorner → filas normalizadas para la app.
# Las credenciales viven SOLO en esta máquina: variables de entorno o
# ~/.fos-scouting/credentials.json  →  {"statsbomb": {"username", "password"},
#                                       "skillcorner": {"username", "password"}}
# ============================================================================

import datetime as _dt
import os
from pathlib import Path

import requests as _requests

_CREDENTIALS_FILE = Path.home() / ".fos-scouting" / "credentials.json"
_cache: dict = {}


def _file_credentials(platform: str) -> dict:
    try:
        import json as _json
        return _json.loads(_CREDENTIALS_FILE.read_text()).get(platform, {})
    except Exception:
        return {}


def _statsbomb_auth():
    creds = _file_credentials("statsbomb")
    user = os.environ.get("SB_USERNAME") or os.environ.get("STATSBOMB_USERNAME") or creds.get("username")
    password = os.environ.get("SB_PASSWORD") or os.environ.get("STATSBOMB_PASSWORD") or creds.get("password")
    return (user, password) if user and password else None


def _skillcorner_auth():
    creds = _file_credentials("skillcorner")
    user = os.environ.get("SKILLCORNER_USERNAME") or creds.get("username")
    password = os.environ.get("SKILLCORNER_PASSWORD") or creds.get("password")
    return (user, password) if user and password else None


def _cached_get(key: str, url: str, auth, params=None, ttl_seconds: int = 600):
    now = _dt.datetime.now().timestamp()
    hit = _cache.get(key)
    if hit and now - hit[0] < ttl_seconds:
        return hit[1]
    response = _requests.get(url, auth=auth, params=params, timeout=60)
    response.raise_for_status()
    data = response.json()
    _cache[key] = (now, data)
    return data


def _age_from_birth(birth: str):
    try:
        born = _dt.date.fromisoformat(birth)
        today = _dt.date.today()
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    except Exception:
        return ""


_SB_POSITIONS = {
    "Goalkeeper": "GK",
    "Right Back": "RB", "Left Back": "LB",
    "Right Wing Back": "RWB", "Left Wing Back": "LWB",
    "Centre Back": "CB", "Right Centre Back": "RCB", "Left Centre Back": "LCB",
    "Centre Defensive Midfielder": "DMF", "Right Defensive Midfielder": "RDMF", "Left Defensive Midfielder": "LDMF",
    "Right Centre Midfielder": "RCMF", "Left Centre Midfielder": "LCMF",
    "Centre Attacking Midfielder": "AMF", "Right Attacking Midfielder": "RAMF", "Left Attacking Midfielder": "LAMF",
    "Right Wing": "RW", "Left Wing": "LW", "Right Midfielder": "RM", "Left Midfielder": "LM",
    "Centre Forward": "CF", "Right Centre Forward": "RCF", "Left Centre Forward": "LCF",
}

# columna normalizada → (campo StatsBomb, multiplicador)
_SB_METRICS = {
    "npxG per 90 (SB)": ("player_season_np_xg_90", 1),
    "npxG per shot (SB)": ("player_season_np_xg_per_shot", 1),
    "xA per 90 (SB)": ("player_season_xa_90", 1),
    "Key passes per 90 (SB)": ("player_season_key_passes_90", 1),
    "OBV per 90 (SB)": ("player_season_obv_90", 1),
    "Deep progressions per 90 (SB)": ("player_season_deep_progressions_90", 1),
    "Dribbles per 90 (SB)": ("player_season_dribbles_90", 1),
    "Touches in box per 90 (SB)": ("player_season_touches_inside_box_90", 1),
    "Pressures per 90 (SB)": ("player_season_pressures_90", 1),
    "Counterpressures per 90 (SB)": ("player_season_counterpressures_90", 1),
    "PAdj tackles (SB)": ("player_season_padj_tackles_90", 1),
    "PAdj interceptions (SB)": ("player_season_padj_interceptions_90", 1),
    "Aerial win % (SB)": ("player_season_aerial_ratio", 100),
    "Crossing % (SB)": ("player_season_crossing_ratio", 100),
    "GSAA per 90 (SB)": ("player_season_gsaa_90", 1),
    "xG faced per 90 (SB)": ("player_season_np_xg_faced_90", 1),
    "Save % (SB)": ("player_season_save_ratio", 100),
    "OBV GK per 90 (SB)": ("player_season_obv_gk_90", 1),
}


@app.get("/api/sources/status")
async def sources_status():
    payload = {
        "statsbomb": _statsbomb_auth() is not None,
        "skillcorner": _skillcorner_auth() is not None,
    }
    import json as _json
    return Response(_json.dumps(payload), media_type="application/json", headers=cors_headers())


@app.get("/api/statsbomb/competitions")
async def statsbomb_competitions():
    import json as _json
    auth = _statsbomb_auth()
    if not auth:
        return Response('{"error": "sin credenciales"}', status_code=503, media_type="application/json", headers=cors_headers())
    data = _cached_get("sb:comps", "https://data.statsbomb.com/api/v4/competitions", auth, ttl_seconds=3600)
    comps = sorted(
        [
            {
                "competition_id": c.get("competition_id"),
                "season_id": c.get("season_id"),
                "name": c.get("competition_name"),
                "season": c.get("season_name"),
                "country": c.get("country_name"),
            }
            for c in data
        ],
        key=lambda c: (str(c["name"]), str(c["season"])),
    )
    return Response(_json.dumps(comps), media_type="application/json", headers=cors_headers())


@app.get("/api/statsbomb/player-stats")
async def statsbomb_player_stats(competition_id: int, season_id: int):
    import json as _json
    auth = _statsbomb_auth()
    if not auth:
        return Response('{"error": "sin credenciales"}', status_code=503, media_type="application/json", headers=cors_headers())
    url = f"https://data.statsbomb.com/api/v2/competitions/{competition_id}/seasons/{season_id}/player-stats"
    data = _cached_get(f"sb:{competition_id}:{season_id}", url, auth)
    rows = []
    for p in data:
        row = {
            "Player": p.get("player_name", ""),
            "Team": p.get("team_name", ""),
            "Position": _SB_POSITIONS.get(p.get("primary_position") or "", p.get("primary_position") or ""),
            "Age": _age_from_birth(p.get("birth_date") or ""),
            "Birth date": p.get("birth_date") or "",
            "Minutes played": round(p.get("player_season_minutes") or 0),
            "Matches played": p.get("player_season_appearances") or 0,
        }
        # StatsBomb entrega tasas por 90; los contadores de la tarjeta usan
        # totales, así que se reconstruyen desde minutos jugados.
        minutes = p.get("player_season_minutes") or 0
        for total_col, rate_field in (("Goals", "player_season_goals_90"), ("Assists", "player_season_assists_90")):
            rate = p.get(rate_field)
            row[total_col] = round(rate * minutes / 90) if isinstance(rate, (int, float)) else ""
        for column, (field, factor) in _SB_METRICS.items():
            value = p.get(field)
            row[column] = round(value * factor, 4) if isinstance(value, (int, float)) else ""
        rows.append(row)
    return Response(_json.dumps({"rows": rows, "provider": "statsbomb"}), media_type="application/json", headers=cors_headers())


# columna normalizada → claves candidatas en la respuesta física de SkillCorner
# (nombres confirmados contra /api/physical/ con group_by=player,team,season,
# average_per=p90 y data_version=3, agosto 2026)
_SC_METRICS = {
    "Distance per 90 (SC)": ["total_distance_full_all_p90", "total_distance_per_90"],
    "HSR distance per 90 (SC)": ["hsr_distance_full_all_p90", "hsr_distance_per_90"],
    "Sprint distance per 90 (SC)": ["sprint_distance_full_all_p90", "sprint_distance_per_90"],
    "Sprints per 90 (SC)": ["sprint_count_full_all_p90", "sprint_count_per_90"],
    "High accelerations per 90 (SC)": ["highaccel_count_full_all_p90", "highaccel_count_per_90"],
    "PSV-99 (SC)": ["psv99", "psv_99"],
}


@app.get("/api/skillcorner/competitions")
async def skillcorner_competitions():
    import json as _json
    auth = _skillcorner_auth()
    if not auth:
        return Response('{"error": "sin credenciales"}', status_code=503, media_type="application/json", headers=cors_headers())
    data = _cached_get("sc:comps", "https://skillcorner.com/api/competition_editions/", auth, params={"user": "true", "limit": 300}, ttl_seconds=3600)
    editions = data.get("results", data if isinstance(data, list) else [])
    comps = [
        {
            "id": e.get("id"),
            "name": (e.get("competition") or {}).get("name") or e.get("name"),
            "season": (e.get("season") or {}).get("name") or "",
        }
        for e in editions
    ]
    return Response(_json.dumps(comps), media_type="application/json", headers=cors_headers())


@app.get("/api/skillcorner/player-stats")
async def skillcorner_player_stats(competition_edition_id: int):
    import json as _json
    auth = _skillcorner_auth()
    if not auth:
        return Response('{"error": "sin credenciales"}', status_code=503, media_type="application/json", headers=cors_headers())
    base_params = {
        "competition_edition": competition_edition_id,
        "possession": "all",
        "playing_time__gte": 60,
        "data_version": "3",
        "page_size": 2000,
        "average_per": "p90",
    }
    data = _cached_get(
        f"sc:{competition_edition_id}",
        "https://skillcorner.com/api/physical/",
        auth,
        params={**base_params, "group_by": "player,team,season"},
    )
    # Agrupar por posición parte a cada jugador en varias filas, así que la
    # posición principal (más minutos totales) sale de una segunda consulta.
    by_position = _cached_get(
        f"sc:{competition_edition_id}:pos",
        "https://skillcorner.com/api/physical/",
        auth,
        params={**base_params, "group_by": "player,team,season,position"},
    )
    primary_position = {}
    for p in by_position.get("results", []):
        pid = p.get("player_id")
        total = (p.get("minutes_full_all") or 0) * (p.get("count_match") or 0)
        if pid is not None and total >= primary_position.get(pid, (0, ""))[0]:
            primary_position[pid] = (total, p.get("position") or p.get("position_group") or "")
    results = data.get("results", data if isinstance(data, list) else [])
    rows = []
    for p in results:
        # En el agregado por temporada, minutes_full_all es el promedio por
        # partido; el total se reconstruye con el número de partidos.
        matches = p.get("count_match") or 0
        row = {
            "Player": p.get("player_name") or p.get("player_short_name") or "",
            "Team": p.get("team_name") or "",
            "Position": primary_position.get(p.get("player_id"), (0, ""))[1],
            "Age": _age_from_birth(p.get("player_birthdate") or ""),
            "Birth date": p.get("player_birthdate") or "",
            "Minutes played": round((p.get("minutes_full_all") or 0) * matches),
            "Matches played": matches,
        }
        for column, fields in _SC_METRICS.items():
            value = next((p.get(f) for f in fields if isinstance(p.get(f), (int, float))), "")
            row[column] = round(value, 4) if isinstance(value, (int, float)) else ""
        rows.append(row)
    return Response(_json.dumps({"rows": rows, "provider": "skillcorner"}), media_type="application/json", headers=cors_headers())
