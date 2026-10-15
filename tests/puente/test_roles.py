"""Roles en la secuencia: una coordenada a medias no tumba el partido.

Se corre con el Python del puente:  ~/.rembg-venv/bin/python -m pytest tests/puente
o sin pytest:                        ~/.rembg-venv/bin/python tests/puente/test_roles.py
"""
import importlib.util
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("bg_server", RAIZ / "scripts" / "bg-server.py")
bg = importlib.util.module_from_spec(spec)
sys.modules["bg_server"] = bg
spec.loader.exec_module(bg)


def test_punto():
    assert bg._punto([60, 40]) == (60.0, 40.0)
    assert bg._punto([None, 40.0]) is None
    assert bg._punto([60]) is None
    assert bg._punto(None) is None
    assert bg._punto([True, 40]) is None


def test_pase_con_coordenada_a_medias_no_rompe():
    eventos = [
        {"t": "Ball Receipt*", "l": [50, 40], "de": [45, 40]},
        {"t": "Pass", "l": [50, 40], "e": [None, 42.0]},
    ]
    # Sin pase usable no hay rol de pase; tampoco excepción.
    assert bg._rol_de_intervencion(eventos, False) is None


def test_pase_bueno_sigue_contando():
    eventos = [
        {"t": "Ball Receipt*", "l": [50, 40], "de": [45, 40]},
        {"t": "Pass", "l": [50, 40], "e": [85, 40]},
    ]
    assert bg._rol_de_intervencion(eventos, False) == "vertical"


if __name__ == "__main__":
    for nombre, prueba in list(globals().items()):
        if nombre.startswith("test_"):
            prueba()
            print("ok", nombre)
