import assert from "node:assert/strict";
import test from "node:test";
import { buscadorDeFisico, conSkillcorner, valoresSkillcorner } from "../lib/skillcornerPartido.ts";
import { consejosDePizarra, DIBUJOS } from "../lib/pizarra.ts";
import { zonasDelChoque } from "../lib/partido.ts";

/** SkillCorner en El partido: valores por equipo, consejos con su prueba y el choque por zonas. */

test("game intelligence por 30′ con o sin balón, y el físico de sus jugadores ponderado por minutos", () => {
  const equipos = [{ team_name: "Inter Toronto Football Club", minutes_tip: 15, minutes_otip: 20, behindrun_count: 1, onballengagement_count: 30,
    onballengagement_count_pressingchain: 9, possession_pct_drawnpressure_retained: 55, onballengagement_pct_beatenbymovement: 0.8 }];
  const jugadores = [
    { Player: "A", Team: "Inter Toronto FC", Position: "LCB", "Minutes played": 900, "PSV-99 (SC)": 30 },
    { Player: "B", Team: "Inter Toronto FC", Position: "RCB", "Minutes played": 300, "PSV-99 (SC)": 26 },
    { Player: "C", Team: "Inter Toronto FC", Position: "RCB", "Minutes played": 100, "PSV-99 (SC)": 20 },
  ];
  const valores = valoresSkillcorner([{ id: 7, nombre: "Inter Toronto" }], equipos, jugadores).get(7);
  assert.equal(valores.sc_rupturas, 2, "1 ruptura en 15′ con balón son 2 por 30′");
  assert.equal(valores.sc_presiones, 45);
  assert.equal(valores.sc_cadenas, 0.3);
  assert.equal(valores.sc_retencion, 0.55);
  assert.ok(Math.abs(valores.sc_superado_movimiento - 0.008) < 1e-12);
  assert.equal(valores.fis_vel_centrales, 29, "(30·900 + 26·300) / 1200; el de 100′ no cuenta");
  const medias = conSkillcorner(new Map([[7, { posesion: 0.5 }]]), new Map([[7, valores]]));
  assert.equal(medias.get(7).posesion, 0.5);
  assert.equal(medias.get(7).sc_rupturas, 2);
});

test("el físico por nombre: completo o, si SkillCorner lo acorta, apellido e inicial únicos", () => {
  const fisico = buscadorDeFisico([{ Player: "Phillip Goodrum", "PSV-99 (SC)": 29 }, { Player: "Ali Musse", "PSV-99 (SC)": 31.5 }]);
  assert.equal(fisico("Ali Musse").psv99, 31.5);
  assert.equal(fisico("Phillip Joseph Goodrum").psv99, 29);
  assert.equal(fisico("Nadie Conocido"), null);
});

const lectura = (id, tercio) => ({ metrica: { id, etiqueta: id, palabras: ["a", "m", "b"], fuente: "skillcorner" }, valor: 1, mediaLiga: 1, puesto: 1, equipos: 8, tercio, palabra: "" });

test("los consejos de SkillCorner: presionar su salida, sus rupturas, y la carrera con sus pruebas", () => {
  const b = { sc_retencion: lectura("sc_retencion", 2), sc_rupturas_peligrosas: lectura("sc_rupturas_peligrosas", 0), fis_vel_centrales: lectura("fis_vel_centrales", 2) };
  const a = { sc_presiones: lectura("sc_presiones", 0), fis_vel_ataque: lectura("fis_vel_ataque", 0), altura_defensa: lectura("altura_defensa", 0) };
  const { oportunidades, riesgos } = consejosDePizarra(DIBUJOS["433"], DIBUJOS["442"], { a: (id) => a[id] ?? null, b: (id) => b[id] ?? null }, "442");
  const presionar = oportunidades.find((c) => c.id === "presionar_salida");
  assert.equal(presionar.estado, "respaldado");
  assert.ok(oportunidades.some((c) => c.id === "carrera"), "puntas rápidos contra centrales lentos");
  const rupturas = riesgos.find((c) => c.id === "sus_rupturas");
  assert.equal(rupturas.estado, "respaldado");
  assert.ok(rupturas.pruebas.some((p) => p.lectura.metrica.id === "altura_defensa" && p.apoya), "con línea alta, más riesgo");
});

test("el choque en cinco zonas, con cada banda por separado", () => {
  const zonas = zonasDelChoque(DIBUJOS["433"], DIBUJOS["352"]);
  const de = (id) => zonas.find((z) => z.zona === id);
  assert.deepEqual([de("salida_a").a, de("salida_a").b], [2, 2], "dos centrales contra dos puntas");
  assert.deepEqual([de("banda_izq").a, de("banda_izq").b], [2, 1], "lateral y extremo contra un carrilero");
  assert.equal(de("banda_izq").ventaja, "a");
  assert.equal(de("medio").ventaja, null, "tres contra tres");
});
