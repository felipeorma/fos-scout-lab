import assert from "node:assert/strict";
import test from "node:test";
import {
  choqueDeDibujos,
  crucesDeEstilo,
  esperado,
  estructuraDe,
  formacionProbable,
  fuertesYFlojos,
  lineaDefensiva,
  mediasDeLiga,
  onceTipico,
  partidosDe,
  perfilesDeDimension,
  prediccionDelPartido,
  proximoPartido,
  rendimientoPorLinea,
  ventajas,
} from "../lib/partido.ts";

/**
 * El partido: formación probable, choque de dibujos, lo esperado y las
 * ventajas, con partidos hechos a mano donde se sabe qué tiene que salir.
 */

const ONCE_4231 = ["GK", "LB", "LCB", "RCB", "RB", "LDMF", "RDMF", "LW", "AMF", "RW", "CF"];
const ONCE_352 = ["GK", "LCB", "CB", "RCB", "LWB", "RWB", "LCMF", "CMF", "RCMF", "LCF", "RCF"];
const ONCE_442 = ["GK", "LB", "LCB", "RCB", "RB", "LM", "LCMF", "RCMF", "RM", "LCF", "RCF"];

const lado = (equipo, nombre, goles, formacion, once, stats) => ({ equipo, nombre, goles, formacion, cambios: 0, once, stats });
const partido = (i, fecha, local, visita) => ({ partido: i, fecha, jornada: i, local, visita });

test("los partidos de un equipo, desde su lado y en orden", () => {
  const liga = { fallidos: 0, partidos: [
    partido(2, "2026-05-10", lado(2, "B", 0, "352", ONCE_352, { np_xg: 0.5 }), lado(1, "A", 2, "4231", ONCE_4231, { np_xg: 1.8 })),
    partido(1, "2026-05-01", lado(1, "A", 1, "4231", ONCE_4231, { np_xg: 1.2 }), lado(2, "B", 1, "352", ONCE_352, { np_xg: 0.9 })),
  ] };
  const deA = partidosDe(liga, 1);
  assert.deepEqual(deA.map((p) => [p.fecha, p.enCasa, p.gf, p.gc, p.rival]), [["2026-05-01", true, 1, 1, "B"], ["2026-05-10", false, 2, 0, "B"]]);
  assert.equal(deA[1].propios.np_xg, 1.8);
  assert.equal(deA[1].delRival.np_xg, 0.5);
  assert.equal(deA[1].formacionRival, "352");
});

test("la formación probable pesa más los últimos partidos", () => {
  const partidos = [
    ...Array.from({ length: 10 }, () => ({ formacion: "442" })),
    ...Array.from({ length: 5 }, () => ({ formacion: "4231" })),
  ];
  const conPeso = formacionProbable(partidos, 4);
  assert.equal(conPeso[0].formacion, "4231", "cambió de dibujo hace cinco partidos");
  // Tres partidos no bastan para dar por cambiado el dibujo de toda una temporada.
  assert.equal(formacionProbable(partidos.slice(0, 13), 4)[0].formacion, "442");
  const sinPeso = formacionProbable(partidos, 1e9);
  assert.equal(sinPeso[0].formacion, "442", "contando todos igual, manda la más usada");
  assert.ok(Math.abs(conPeso.reduce((s, f) => s + f.probabilidad, 0) - 1) < 1e-9);
  assert.equal(conPeso.find((f) => f.formacion === "442").inicios, 10);
});

test("la estructura sale de los puestos reales del once", () => {
  assert.deepEqual(estructuraDe(ONCE_4231), { centrales: 2, laterales: 2, carrileros: 0, pivotes: 2, interiores: 0, mediapuntas: 1, bandas: 2, delanteros: 1 });
  assert.equal(lineaDefensiva(estructuraDe(ONCE_352)), 3);
  assert.equal(lineaDefensiva(estructuraDe(ONCE_442)), 4);
  const partidos = [
    { formacion: "4231", once: ONCE_4231 }, { formacion: "4231", once: ONCE_4231 },
    { formacion: "4231", once: ONCE_4231.map((c) => (c === "AMF" ? "CMF" : c)) },
  ];
  assert.deepEqual(onceTipico(partidos, "4231"), [...ONCE_4231].sort(), "el reparto que más se repite");
  assert.equal(onceTipico(partidos, "352"), null);
});

test("el choque de dibujos: 4-2-3-1 contra 3-5-2", () => {
  const zonas = Object.fromEntries(choqueDeDibujos(estructuraDe(ONCE_4231), estructuraDe(ONCE_352)).map((z) => [z.zona, z]));
  // Salida del 4-2-3-1: dos centrales contra las dos puntas del 3-5-2.
  assert.deepEqual([zonas.salida_a.a, zonas.salida_a.b, zonas.salida_a.ventaja], [2, 2, null]);
  // Salida del 3-5-2: tres centrales contra una punta: dos de sobra.
  assert.deepEqual([zonas.salida_b.a, zonas.salida_b.b, zonas.salida_b.ventaja], [1, 3, "b"]);
  assert.deepEqual([zonas.medio.a, zonas.medio.b, zonas.medio.ventaja], [3, 3, null]);
  // Por banda, lateral y extremo contra un carrilero.
  assert.deepEqual([zonas.bandas.a, zonas.bandas.b, zonas.bandas.ventaja], [2, 1, "a"]);
});

test("lo esperado: lo que hace uno más lo que concede el otro, encogido por k", () => {
  assert.equal(esperado(1, 1.5, 1.2, 1), 1.7);
  assert.equal(esperado(1, 1.5, 1.2, 0.5), 1.35);
  assert.ok(Number.isNaN(esperado(1, Number.NaN, 1, 1)));

  // B concede mucho (1,45 de media) y C poco (0,75).
  const fila = (fecha, a, b, ga, gb, sa, sb) => partido(fecha, fecha, lado(a, `E${a}`, ga, "442", ONCE_442, sa), lado(b, `E${b}`, gb, "442", ONCE_442, sb));
  const liga = { fallidos: 0, partidos: [
    fila("2026-01-01", 1, 3, 0, 0, { np_xg: 0.9, possession: 0.6 }, { np_xg: 0.6, possession: 0.4 }),
    fila("2026-01-08", 2, 3, 0, 1, { np_xg: 0.6, possession: 0.5 }, { np_xg: 0.7, possession: 0.5 }),
    fila("2026-01-15", 1, 2, 2, 1, { np_xg: 2.2, possession: 0.55 }, { np_xg: 1.4, possession: 0.45 }),
  ] };
  const medias = mediasDeLiga(liga, ["np_xg", "possession"]);
  const contraB = prediccionDelPartido(partidosDe(liga, 1), partidosDe(liga, 2), medias);
  const contraC = prediccionDelPartido(partidosDe(liga, 1), partidosDe(liga, 3), medias);
  const xg = (p) => p.find((e) => e.metrica.campo === "np_xg").a;
  assert.ok(xg(contraB) > xg(contraC), "contra quien concede más, se espera más");
  const posesion = contraB.find((e) => e.metrica.campo === "possession");
  assert.ok(Math.abs(posesion.a + posesion.b - 1) < 1e-9, "la posesión suma 100%");
});

test("las ventajas: solo donde uno es fuerte Y el otro flojo", () => {
  const dim = (id, zHace, zConcede) => ({ dimension: { id, etiqueta: id, campo: id }, zHace, zConcede, puestoHace: 1, puestoConcede: 1, equipos: 8 });
  const a = [dim("contra", 1.5, 0), dim("parado", 1.2, 0), dim("centros", -0.5, 0)];
  const b = [dim("contra", 0, 1.0), dim("parado", 0, -0.8), dim("centros", 0, 2.0)];
  const lista = ventajas(a, b);
  assert.deepEqual(lista.map((v) => v.dimension.id), ["contra"], "parado: B lo defiende bien; centros: A no los genera");
  assert.equal(lista[0].fuerza, 2.5);

  const { fuertes, flojos } = fuertesYFlojos([dim("contra", 1.5, -1.0), dim("centros", -1.2, 0.9)]);
  assert.deepEqual(fuertes.map((l) => [l.dimension.id, l.lado]), [["contra", "hace"], ["contra", "concede"]]);
  assert.deepEqual(flojos.map((l) => [l.dimension.id, l.lado]), [["centros", "hace"], ["centros", "concede"]]);
});

test("las dimensiones de cada equipo, contra los de su liga", () => {
  const fila = (fecha, a, b, sa, sb) => partido(fecha, fecha, lado(a, `E${a}`, 0, "442", ONCE_442, sa), lado(b, `E${b}`, 0, "442", ONCE_442, sb));
  const liga = { fallidos: 0, partidos: [
    fila("1", 1, 2, { counter_attacking_shots: 4 }, { counter_attacking_shots: 1 }),
    fila("2", 1, 3, { counter_attacking_shots: 5 }, { counter_attacking_shots: 1 }),
    fila("3", 2, 3, { counter_attacking_shots: 1 }, { counter_attacking_shots: 2 }),
  ] };
  const perfiles = perfilesDeDimension(liga, [{ id: "contra", etiqueta: "Contra", campo: "counter_attacking_shots" }]);
  const [a] = perfiles.get(1);
  assert.ok(a.zHace > 1, "el 1 es el que más contraataca");
  assert.equal(a.puestoHace, 1);
  assert.equal(a.equipos, 3);
});

test("contra línea de 3 y contra línea de 4", () => {
  const partidos = [
    { gf: 2, gc: 0, onceRival: ONCE_352, propios: { np_xg: 2 }, delRival: { np_xg: 0.5 } },
    { gf: 0, gc: 1, onceRival: ONCE_442, propios: { np_xg: 0.8 }, delRival: { np_xg: 1.4 } },
    { gf: 1, gc: 1, onceRival: ONCE_4231, propios: { np_xg: 1.2 }, delRival: { np_xg: 1.0 } },
  ];
  const r = rendimientoPorLinea(partidos);
  assert.deepEqual([r[3].partidos, r[3].puntos], [1, 3]);
  assert.deepEqual([r[4].partidos, r[4].puntos], [2, 1]);
  assert.equal(r[4].xg, 1);
});

test("el próximo partido sale del calendario", () => {
  const liga = { fallidos: 0, partidos: [], pendientes: [
    { fecha: "2026-10-25", local: { equipo: 5, nombre: "Pacific FC" }, visita: { equipo: 1, nombre: "Cavalry FC" } },
    { fecha: "2026-10-18", local: { equipo: 1, nombre: "Cavalry FC" }, visita: { equipo: 7, nombre: "Forge FC" } },
  ] };
  assert.deepEqual(proximoPartido(liga, 1), { fecha: "2026-10-18", rival: 7, rivalNombre: "Forge FC", enCasa: true });
  assert.equal(proximoPartido(liga, 99), null);
  assert.equal(proximoPartido({ fallidos: 0, partidos: [] }, 1), null);
});

test("los cruces de estilo: cada regla con las métricas que la disparan", () => {
  const perfil = (valores) => ({ valores: Object.fromEntries(Object.entries(valores).map(([id, z]) => [id, { z }])) });
  const a = perfil({ sc_rupturas: 1.2, ppda: 1.0, contragolpe: 0.9, contrapresion: 0.8, directo: -1 });
  const b = perfil({ altura: 0.9, salida_corta: 1.1, posesion: 0.7, sc_retencion: -0.9 });
  const cruces = crucesDeEstilo(a, b);
  assert.deepEqual(cruces.map((c) => c.id).sort(), ["contrapresion", "espalda", "presion_salida", "transicion"]);
  const presion = cruces.find((c) => c.id === "presion_salida");
  assert.deepEqual(presion.de.map((d) => d.metrica), ["ppda", "salida_corta", "sc_retencion"]);
  // Sin SkillCorner, la espalda se mira con el juego directo.
  const sinSc = crucesDeEstilo(perfil({ directo: 0.8 }), perfil({ altura: 0.6 }));
  assert.deepEqual(sinSc.map((c) => [c.id, c.de[0].metrica]), [["espalda", "directo"]]);
  // Nada por debajo del umbral.
  assert.deepEqual(crucesDeEstilo(perfil({ sc_rupturas: 0.3 }), perfil({ altura: 2 })), []);
});

test("la calibración guardada es coherente: el modelo nunca empeora y las poco predecibles se marcan", async () => {
  const { PREDICCION_CALIBRADA, K_PREDICCION, METRICAS_PARTIDO, mejoraDelModelo, MEJORA_MINIMA, VIDA_MEDIA_FORMACION } = await import("../lib/partido.ts");
  for (const metrica of METRICAS_PARTIDO) {
    assert.ok(K_PREDICCION[metrica.campo] > 0 && K_PREDICCION[metrica.campo] <= 1, metrica.campo);
    assert.ok(mejoraDelModelo(metrica.campo) > 0, `${metrica.campo}: el modelo no mejora a la referencia`);
  }
  assert.ok(mejoraDelModelo("possession") > 0.08);
  assert.ok(mejoraDelModelo("directness") < MEJORA_MINIMA, "juego directo: casi azar");
  assert.ok(PREDICCION_CALIBRADA.formacion.acierto > PREDICCION_CALIBRADA.formacion.ultima);
  assert.equal(VIDA_MEDIA_FORMACION, 2);
});
