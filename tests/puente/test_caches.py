"""Las cachés del puente no crecen sin fin.

~/.rembg-venv/bin/python tests/puente/test_caches.py
"""
import importlib.util
import os
import pathlib
import sys
import tempfile
import time

RAIZ = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("bg_server_caches", RAIZ / "scripts" / "bg-server.py")
bg = importlib.util.module_from_spec(spec)
sys.modules["bg_server_caches"] = bg
spec.loader.exec_module(bg)


def test_cache_acotada_saca_lo_menos_usado():
    cache = bg._CacheAcotada(3)
    for clave in "abc":
        cache[clave] = clave
    assert cache.get("a") == "a"  # "a" pasa a ser la más reciente
    cache["d"] = "d"
    assert set(cache) == {"a", "c", "d"}, set(cache)
    assert cache.get("b") is None
    assert len(cache) == 3


def test_poda_de_eventos_borra_lo_mas_viejo():
    with tempfile.TemporaryDirectory() as carpeta:
        bg._SB_EVENTS_CACHE_DIR = pathlib.Path(carpeta)
        ahora = time.time()
        for i in range(10):
            ruta = pathlib.Path(carpeta) / f"m-{i}.json"
            ruta.write_bytes(b"x" * 1000)
            os.utime(ruta, (ahora - (10 - i) * 60, ahora - (10 - i) * 60))
        (pathlib.Path(carpeta) / "f-1.json").write_bytes(b"y" * 5000)
        borrados = bg._podar_cache_eventos(tope=5000)
        quedan = sorted(p.name for p in pathlib.Path(carpeta).glob("m-*.json"))
        assert borrados == 6, borrados  # hasta el 90 % del tope: 4.500 bytes, cuatro partidos
        assert quedan == ["m-6.json", "m-7.json", "m-8.json", "m-9.json"], quedan
        assert (pathlib.Path(carpeta) / "f-1.json").exists(), "los derivados se quedan"


if __name__ == "__main__":
    for nombre, prueba in list(globals().items()):
        if nombre.startswith("test_"):
            prueba()
            print("ok", nombre)
