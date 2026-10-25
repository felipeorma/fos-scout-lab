import assert from "node:assert/strict";
import test from "node:test";
import { DIBUJOS, colocar, consejosDePizarra, distanciaDePuesto, oncePara } from "../lib/pizarra.ts";
import { FASES, fasesDeLiga, formaReciente, lecturaDe, lecturaDeFases } from "../lib/fases.ts";

/** La pizarra (dibujos, once, consejos) y las fases del juego, con datos hechos a mano. */

test("cada dibujo tiene once puestos, un portero y ninguno repetido", () => {
  for (const [codigo, puestos] of Object.entries(DIBUJOS)) {
    assert.equal(puestos.length, 11, codigo);
    assert.equal(puestos.filter((p) => p === "GK").length, 1, codigo);
    assert.equal(new Set(puestos).size, 11, codigo);
    const suma = codigo.split("").reduce((s, d) => s + Number(d), 0);
    assert.equal(suma, 10, `${codigo}: las líneas suman diez de campo`);
  }
});

test("el puesto más cercano: mismo puesto, luego su familia y su lado", () => {
  assert.equal(distanciaDePuesto("LB", "LB"), 0);
  assert.ok(distanciaDePuesto("LB", "LWB") < distanciaDePuesto("RB", "LWB"), "el lateral izquierdo va antes al carril izquierdo");
  assert.ok(distanciaDePuesto("CF", "AMF") < distanciaDePuesto("LCB", "AMF"));
  assert.equal(distanciaDePuesto("GK", "CF"), Number.POSITIVE_INFINITY);
  assert.ok(Number.isFinite(distanciaDePuesto("LCB", "LW")), "fuera de sitio, pero cabe");
});

test("el once sale del último partido con ese dibujo; si no hay, se recoloca el último once", () => {
  const de4231 = DIBUJOS["4231"].map((p, i) => [p, `J${i}`]);
  const de352 = DIBUJOS["352"].map((p, i) => [p, `K${i}`]);
  const partidos = [{ formacion: "4231", titulares: de4231 }, { formacion: "352", titulares: de352 }];
  assert.deepEqual(oncePara(DIBUJOS["4231"], partidos, "4231"), de4231.map(([, j]) => j));
  // Pide 4-4-2 y nunca salió así: el último once (3-5-2) recolocado, sin repetir a nadie.
  const nuevo = oncePara(DIBUJOS["442"], partidos, "442");
  assert.equal(nuevo.filter(Boolean).length, 11);
  assert.equal(new Set(nuevo).size, 11);
  assert.equal(nuevo[0], "K0", "el portero sigue de portero");
  assert.deepEqual(colocar(["GK", "CF"], [["CF", "Punta"], ["GK", "Arquero"]]), ["Arquero", "Punta"]);
});

const lectura = (id, tercio, extra = {}) => ({ metrica: { id, etiqueta: id, palabras: ["a", "m", "b"] }, valor: 1, mediaLiga: 1, puesto: 1, equipos: 8, tercio, palabra: "", ...extra });

test("los consejos del cruce: la pizarra y, a su lado, los datos", () => {
  const datosB = { altura_defensa: lectura("altura_defensa", 0), ancho_bloque: lectura("ancho_bloque", 2), altura_presion: lectura("altura_presion", 0), parado_favor: lectura("parado_favor", 0) };
  const { oportunidades, riesgos } = consejosDePizarra(DIBUJOS["4231"], DIBUJOS["352"], { a: () => null, b: (id) => datosB[id] ?? null }, "352");
  const ids = (l) => l.map((c) => c.id);
  assert.ok(ids(oportunidades).includes("linea3"), "contra línea de 3, bandas");
  assert.ok(ids(oportunidades).includes("espalda"), "defiende alto: espacio a la espalda");
  assert.ok(ids(oportunidades).includes("lado_debil"), "bloque estrecho: cambio de orientación");
  assert.ok(ids(riesgos).includes("dos_puntas"), "dos puntas contra dos centrales");
  assert.ok(ids(riesgos).includes("su_presion"));
  assert.ok(ids(riesgos).includes("su_parado"));
  assert.ok(!ids(oportunidades).includes("un_punta"));
  const espalda = oportunidades.find((c) => c.id === "espalda");
  assert.equal(espalda.pruebas[0].equipo, "b");
  // 5-3-2 replegado: línea de 5, no de 3.
  const contraCinco = consejosDePizarra(DIBUJOS["433"], DIBUJOS["532"], { a: () => null, b: () => null }, "532");
  assert.ok(ids(contraCinco.oportunidades).includes("linea5"));
  assert.ok(!ids(contraCinco.oportunidades).includes("linea3"));
});

test("las fases: medias por partido, puesto y tercio en su liga", () => {
  const lado = (equipo, stats) => ({ equipo, nombre: `E${equipo}`, goles: 0, formacion: "442", cambios: 0, once: [], stats });
  const liga = { fallidos: 0, partidos: [
    { partido: 1, fecha: "2026-01-01", jornada: 1, local: lado(1, { defensive_distance: 50, ppda: 7 }), visita: lado(2, { defensive_distance: 40, ppda: 12 }) },
    { partido: 2, fecha: "2026-01-08", jornada: 2, local: lado(3, { defensive_distance: 35, ppda: 15 }), visita: lado(1, { defensive_distance: 48, ppda: 8 }) },
    { partido: 3, fecha: "2026-01-15", jornada: 3, local: lado(2, { defensive_distance: 42, ppda: 11 }), visita: lado(3, { defensive_distance: 36, ppda: 14 }) },
  ] };
  const forma = { con360: 0, fallidos: 0, partidos: [
    { partido: 1, fecha: "2026-01-01", equipos: { 1: { pasesUltimoTercio: 60, largoEstimado: 40 }, 2: { pasesUltimoTercio: 20, largoEstimado: 50 } } },
  ] };
  const medias = fasesDeLiga(liga, forma);
  assert.equal(medias.get(1).altura_defensa, 49);
  assert.equal(medias.get(1).inclinacion, 0.75, "60 de 80 pases en el último tercio");
  const fases = lecturaDeFases(medias, 1);
  const altura = lecturaDe(fases, "altura_defensa");
  assert.deepEqual([altura.puesto, altura.equipos, altura.tercio, altura.palabra], [1, 3, 0, "bloque alto"]);
  const ppda = lecturaDe(fases, "ppda");
  assert.equal(ppda.palabra, "aprieta", "el PPDA más bajo es el que más aprieta");
  assert.ok(FASES.every((fase) => fase.metricas.length));
  const reciente = formaReciente(liga, 1);
  assert.deepEqual(reciente.map((p) => [p.fecha, p.enCasa, p.resultado]), [["2026-01-08", false, "E"], ["2026-01-01", true, "E"]]);
});

test("un consejo que los datos contradicen se marca y va al final", () => {
  // Contra un 3-5-2 con carrileros... nuestro 3-5-2: "si suben los carrileros, su contra irá por las bandas",
  // pero el rival es el que menos contragolpea de su liga.
  const b = { contragolpe: lectura("contragolpe", 2) };
  const { riesgos } = consejosDePizarra(DIBUJOS["352"], DIBUJOS["4231"], { a: () => null, b: (id) => b[id] ?? null }, "4231");
  const carrileros = riesgos.find((c) => c.id === "carrileros_espalda");
  assert.equal(carrileros.estado, "contradicho");
  assert.equal(carrileros.pruebas[0].apoya, false);
  assert.equal(riesgos.at(-1).estado, "contradicho", "los contradichos, al final");
  // Con el dato a favor, respaldado.
  const conContra = consejosDePizarra(DIBUJOS["352"], DIBUJOS["4231"], { a: () => null, b: (id) => (id === "contragolpe" ? lectura("contragolpe", 0) : null) }, "4231");
  assert.equal(conContra.riesgos.find((c) => c.id === "carrileros_espalda").estado, "respaldado");
});

test("al recolocar un once se busca el menor desajuste total, no solo el primero", () => {
  // Un 4-2-3-1 pasado a 3-5-2: el extremo tiene que acabar de punta antes que el mediapunta de interior y el extremo de interior.
  const titulares = DIBUJOS["4231"].map((p) => [p, p]);
  const nuevo = colocar(DIBUJOS["352"], titulares);
  const puestoDe = (jugador) => DIBUJOS["352"][nuevo.indexOf(jugador)];
  assert.ok(["LCMF", "CMF", "RCMF"].includes(puestoDe("AMF")), `el mediapunta va al medio, no ${puestoDe("AMF")}`);
  assert.equal(new Set(nuevo).size, 11);
});

test("cómo viene: solo los cambios que pasan el umbral, y el cambio de dibujo", async () => {
  const { cambiosRecientes, UMBRAL_DE_CAMBIO } = await import("../lib/fases.ts");
  const { cambioDeDibujo } = await import("../lib/partido.ts");
  const lado = (equipo, stats, formacion = "4231", once = []) => ({ equipo, nombre: `E${equipo}`, goles: 0, formacion, cambios: 0, once, stats });
  // Doce partidos con PPDA ~12 (con algo de ruido) y los cinco últimos a ~7: presiona más.
  const ppdas = [12, 11, 13, 12, 12.5, 11.5, 12, 13, 11, 12, 7, 7.5, 6.5, 7, 7];
  const liga = { fallidos: 0, partidos: ppdas.map((ppda, i) => ({
    partido: i, fecha: `2026-${String(i + 1).padStart(2, "0")}-01`, jornada: i,
    local: lado(1, { ppda, possession: 0.5 + (i % 2 ? 0.01 : -0.01) }), visita: lado(2, { ppda: 12, possession: 0.5 }),
  })) };
  const cambios = cambiosRecientes(liga, null, 1);
  assert.equal(cambios[0].metrica.id, "ppda");
  assert.ok(cambios[0].z <= -UMBRAL_DE_CAMBIO);
  assert.ok(!cambios.some((c) => c.metrica.id === "posesion"), "la posesión apenas se mueve: no es un cambio");
  // Línea de 4 toda la temporada y de 3 en los tres últimos.
  const de4 = ["GK", "LB", "LCB", "RCB", "RB", "LDMF", "RDMF", "LW", "AMF", "RW", "CF"];
  const de3 = ["GK", "LCB", "CB", "RCB", "LWB", "LCMF", "CMF", "RCMF", "RWB", "LCF", "RCF"];
  const partidos = [...Array.from({ length: 8 }, () => ({ formacion: "4231", once: de4 })), ...Array.from({ length: 3 }, () => ({ formacion: "352", once: de3 }))];
  assert.deepEqual(cambioDeDibujo(partidos), { tipo: "linea", antes: 4, ahora: 3, dibujoAhora: "352", partidos: 3 });
  assert.equal(cambioDeDibujo(partidos.slice(0, 8)), null);
});
