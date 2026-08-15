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
_keychain_cache: dict = {}


def _keychain_credentials(platform: str) -> dict:
    """Credenciales cifradas en el Llavero de macOS.

    Se guardan una vez con:
      security add-generic-password -U -s fos-scouting -a <plataforma> -w 'usuario:contraseña'
    El Llavero las cifra en reposo; nunca tocan el repositorio.
    """
    if platform in _keychain_cache:
        return _keychain_cache[platform]
    creds: dict = {}
    try:
        import subprocess as _sp
        out = _sp.run(
            ["/usr/bin/security", "find-generic-password", "-s", "fos-scouting", "-a", platform, "-w"],
            capture_output=True, text=True, timeout=5,
        )
        if out.returncode == 0 and ":" in out.stdout:
            user, _, password = out.stdout.strip().partition(":")
            if user and password:
                creds = {"username": user, "password": password}
    except Exception:
        creds = {}
    _keychain_cache[platform] = creds
    return creds


def _file_credentials(platform: str) -> dict:
    try:
        import json as _json
        return _json.loads(_CREDENTIALS_FILE.read_text()).get(platform, {})
    except Exception:
        return {}


def _stored_credentials(platform: str) -> dict:
    return _keychain_credentials(platform) or _file_credentials(platform)


def _statsbomb_auth():
    creds = _stored_credentials("statsbomb")
    user = os.environ.get("SB_USERNAME") or os.environ.get("STATSBOMB_USERNAME") or creds.get("username")
    password = os.environ.get("SB_PASSWORD") or os.environ.get("STATSBOMB_PASSWORD") or creds.get("password")
    return (user, password) if user and password else None


def _skillcorner_auth():
    creds = _stored_credentials("skillcorner")
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
# Set posicional definitivo (perfiles del director de scouting). Campos
# verificados contra la API v2 en vivo (CPL 2026, agosto 2026). Notas:
# - "Open Play Shots" no existe en v2 → se usa np_shots_90.
# - "Non-Penalty Goals" no existe en v2 → se usa goals_90.
# - "Received Passes" no existe en v2 → omitido.
_SB_METRICS = {
    "Carries (SB)": ("player_season_carries_90", 1),
    "Deep progressions (SB)": ("player_season_deep_progressions_90", 1),
    "Dribble carry OBV (SB)": ("player_season_obv_dribble_carry_90", 1),
    "Defensive action OBV (SB)": ("player_season_obv_defensive_action_90", 1),
    "Pass OBV (SB)": ("player_season_obv_pass_90", 1),
    "Ball recoveries (SB)": ("player_season_ball_recoveries_90", 1),
    "Counterpressures (SB)": ("player_season_counterpressures_90", 1),
    "Tackle dribbled past % (SB)": ("player_season_challenge_ratio", 100),
    "Deep completions (SB)": ("player_season_deep_completions_90", 1),
    "Tackles interceptions (SB)": ("player_season_tackles_and_interceptions_90", 1),
    "OP key passes (SB)": ("player_season_op_key_passes_90", 1),
    "OP passes into box (SB)": ("player_season_op_passes_into_box_90", 1),
    "OP xG assisted (SB)": ("player_season_op_xa_90", 1),
    "Passing % (SB)": ("player_season_passing_ratio", 100),
    "Long ball % (SB)": ("player_season_long_ball_ratio", 100),
    "Long balls (SB)": ("player_season_long_balls_90", 1),
    "Aerial win % (SB)": ("player_season_aerial_ratio", 100),
    "Aerial wins (SB)": ("player_season_aerial_wins_90", 1),
    "Tackles (SB)": ("player_season_tackles_90", 1),
    "Interceptions (SB)": ("player_season_interceptions_90", 1),
    "Blocks per shot (SB)": ("player_season_blocks_per_shot", 1),
    "Pressured pass % (SB)": ("player_season_pressured_passing_ratio", 100),
    "OP passes (SB)": ("player_season_op_passes_90", 1),
    "NP shots (SB)": ("player_season_np_shots_90", 1),
    "xG (SB)": ("player_season_np_xg_90", 1),
    "Through balls (SB)": ("player_season_through_balls_90", 1),
    "Successful dribbles (SB)": ("player_season_dribbles_90", 1),
    "Touches in box (SB)": ("player_season_touches_inside_box_90", 1),
    "Goal conversion % (SB)": ("player_season_conversion_ratio", 100),
    "Goals per 90 (SB)": ("player_season_goals_90", 1),
    "NP PSxG (SB)": ("player_season_np_psxg_90", 1),
    "Fouls won (SB)": ("player_season_fouls_won_90", 1),
    "Penalty wins (SB)": ("player_season_penalty_wins_90", 1),
    "Box cross % (SB)": ("player_season_box_cross_ratio", 100),
    "GK OBV (SB)": ("player_season_obv_gk_90", 1),
    "Shot stopping % (SB)": ("player_season_save_ratio", 100),
    "Opp NP PSxG faced (SB)": ("player_season_np_psxg_faced_90", 1),
    "GK aggressive distance (SB)": ("player_season_da_aggressive_distance", 1),
    "Pass length (SB)": ("player_season_pass_length", 1),
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


# --- Perfiles SkillCorner (cheat sheet del director de scouting) ---
# Físico: claves candidatas contra /api/physical/ (group_by=player,team,season,
# average_per=p90, data_version=3; agosto 2026).
_SC_METRICS = {
    "PSV-99 (SC)": ["psv99", "psv_99"],
    "HSR distance (SC)": ["hsr_distance_full_all_p90", "hsr_distance_full_all"],
    "Meters per minute (SC)": ["total_metersperminute_full_all", "total_metersperminute_full_all_p90"],
    "Time to sprint post COD (SC)": ["timetosprintpostcod_top3", "timetosprintpostcod"],
}

# Game intelligence: columna → (ruta, campos que se suman, modo).
# modo "raw" deja el valor tal cual (porcentajes, promedios); modo "p30"
# normaliza volúmenes a 30 minutos de posesión efectiva: campo/minutes_tip*30.
_SC_GI_ROUTES = {
    "passes": "in_possession/passes",
    "passing_options": "in_possession/passing_options",
    "player_possessions": "in_possession/player_possessions",
    "on_ball_engagements": "out_of_possession/on_ball_engagements",
    "off_ball_runs": "in_possession/off_ball_runs",
}
_SC_GI = {
    "Pass completion % (SC)": ("passes", ["pass_pct_completed"], "raw"),
    "Linebreak passes P30 (SC)": ("passes", ["pass_count_linebreak_completed"], "p30"),
    "Avg xPass attempted (SC)": ("passes", ["pass_avgxpass_attempted"], "raw"),
    "Passes to runs P30 (SC)": ("passes", ["pass_count_torun_completed"], "p30"),
    "Wide options P30 (SC)": ("passing_options", ["optionoffered_count_wide"], "p30"),
    "Linebreak options P30 (SC)": ("passing_options", ["optionoffered_count_linebreak"], "p30"),
    "Box options P30 (SC)": ("passing_options", ["optionoffered_count_penaltyarea"], "p30"),
    "Retention under pressure % (SC)": ("player_possessions", ["reception_pct_intensepressure_tightspace_retained"], "raw"),
    "Forward long carries P30 (SC)": ("player_possessions", ["longcarry_count_forwardtrajectory"], "p30"),
    "Direct regain % (SC)": ("on_ball_engagements", ["onballengagement_pct_directregain"], "raw"),
    "Beaten in duel % (SC)": ("on_ball_engagements", ["onballengagement_pct_beatenbymovement", "onballengagement_pct_beatenbypossession"], "raw"),
    "Overlap underlap runs P30 (SC)": ("off_ball_runs", ["overlaprun_count", "underlaprun_count"], "p30"),
    "Off ball runs P30 (SC)": ("off_ball_runs", ["offballrun_count"], "p30"),
    "Pulling wide runs P30 (SC)": ("off_ball_runs", ["pullingwiderun_count"], "p30"),
    "Runs in behind P30 (SC)": ("off_ball_runs", ["behindrun_count"], "p30"),
    "Dangerous runs behind P30 (SC)": ("off_ball_runs", ["behindrun_count_dangerous"], "p30"),
    "Runs received P30 (SC)": ("off_ball_runs", ["offballrun_count_received"], "p30"),
}


def _sc_gi_data(edition: int, auth):
    """Trae las 5 rutas de game intelligence indexadas por player_id."""
    indexed: dict = {}
    for route_key, path in _SC_GI_ROUTES.items():
        # Estas rutas no aceptan page_size (solo limit/offset); con limit=1000
        # una liga entra en una página y "next" cubre el resto por si acaso.
        params = {"competition_edition": edition, "group_by": "player,team", "limit": 1000}
        if route_key == "off_ball_runs":
            params["variants"] = "obr_type"
        try:
            data = _cached_get(
                f"sc:{edition}:gi:{route_key}",
                f"https://skillcorner.com/api/metrics/game_intelligence/{path}",
                auth,
                params=params,
                ttl_seconds=1800,
            )
            results = list(data.get("results", []))
            next_url = data.get("next")
            pages = 0
            while next_url and pages < 10:
                data = _cached_get(f"sc:gi:next:{next_url}", next_url, auth, ttl_seconds=1800)
                results.extend(data.get("results", []))
                next_url = data.get("next")
                pages += 1
        except Exception:
            continue
        for entry in results:
            pid = entry.get("player_id")
            if pid is None:
                continue
            indexed.setdefault(pid, {})[route_key] = entry
    return indexed


@app.get("/api/skillcorner/competitions")
async def skillcorner_competitions():
    import json as _json
    auth = _skillcorner_auth()
    if not auth:
        return Response('{"error": "sin credenciales"}', status_code=503, media_type="application/json", headers=cors_headers())
    data = _cached_get("sc:comps", "https://skillcorner.com/api/competition_editions/", auth, params={"user": "true", "limit": 300}, ttl_seconds=3600)
    editions = data.get("results", data if isinstance(data, list) else [])
    comps = sorted(
        [
            {
                "id": e.get("id"),
                "name": (e.get("competition") or {}).get("name") or e.get("name"),
                "season": (e.get("season") or {}).get("name") or "",
            }
            for e in editions
        ],
        # Mismo orden que StatsBomb: liga alfabética y, dentro, año ascendente.
        key=lambda c: (str(c["name"]).lower(), str(c["season"])),
    )
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
    gi = _sc_gi_data(competition_edition_id, auth)

    def gi_columns(pid) -> dict:
        columns: dict = {}
        per_route = gi.get(pid, {})
        for column, (route_key, fields, mode) in _SC_GI.items():
            entry = per_route.get(route_key)
            if not entry:
                columns[column] = ""
                continue
            values = [entry.get(f) for f in fields]
            if not all(isinstance(v, (int, float)) for v in values):
                columns[column] = ""
                continue
            total = sum(values)
            if mode == "p30":
                tip = entry.get("minutes_tip")
                total = total / tip * 30 if isinstance(tip, (int, float)) and tip > 0 else None
            columns[column] = round(total, 4) if isinstance(total, (int, float)) else ""
        return columns

    rows = []
    seen_ids = set()
    for p in results:
        # En el agregado por temporada, minutes_full_all es el promedio por
        # partido; el total se reconstruye con el número de partidos.
        matches = p.get("count_match") or 0
        pid = p.get("player_id")
        seen_ids.add(pid)
        row = {
            "Player": p.get("player_name") or p.get("player_short_name") or "",
            "Team": p.get("team_name") or "",
            "Position": primary_position.get(pid, (0, ""))[1],
            "Age": _age_from_birth(p.get("player_birthdate") or ""),
            "Birth date": p.get("player_birthdate") or "",
            "Minutes played": round((p.get("minutes_full_all") or 0) * matches),
            "Matches played": matches,
        }
        for column, fields in _SC_METRICS.items():
            value = next((p.get(f) for f in fields if isinstance(p.get(f), (int, float))), "")
            row[column] = round(value, 4) if isinstance(value, (int, float)) else ""
        row.update(gi_columns(pid))
        rows.append(row)

    # Jugadores con game intelligence pero sin registro físico (lesiones
    # largas, porteros sin tracking físico…) también entran a la base.
    for pid, per_route in gi.items():
        if pid in seen_ids:
            continue
        sample = next(iter(per_route.values()))
        minutes = sample.get("minutes")
        row = {
            "Player": sample.get("player_name") or sample.get("player_short_name") or "",
            "Team": sample.get("team_name") or "",
            "Position": sample.get("position") or sample.get("position_group") or "",
            "Age": _age_from_birth(sample.get("player_birthdate") or ""),
            "Birth date": sample.get("player_birthdate") or "",
            "Minutes played": round(minutes) if isinstance(minutes, (int, float)) else "",
            "Matches played": sample.get("performance_included_count") or "",
        }
        for column in _SC_METRICS:
            row[column] = ""
        row.update(gi_columns(pid))
        if row["Player"]:
            rows.append(row)
    return Response(_json.dumps({"rows": rows, "provider": "skillcorner"}), media_type="application/json", headers=cors_headers())
