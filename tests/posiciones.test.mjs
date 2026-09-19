import assert from "node:assert/strict";
import test from "node:test";
import { roleForPosition } from "../lib/positions.ts";
import { cohortOf } from "../lib/scouting.ts";

/**
 * El vocabulario de posiciones, entero.
 *
 * Wyscout y StatsBomb terminan escribiendo los mismos códigos —el puente
 * traduce los nombres largos de StatsBomb a la nomenclatura de Wyscout—, así
 * que basta un mapa. Lo que no está en él cae en "Otros", y un jugador en
 * "Otros" no aparece en ninguna lista por puesto: ni en el ranking, ni en la
 * mesa, ni en los onces. Por eso esto se prueba código a código.
 *
 * RB5, LB5 y SS faltaban: los carriles de una línea de cinco y el segundo
 * delantero desaparecían de la plataforma sin decir nada.
 */

const VOCABULARIO = {
  GK: "GK",
  RB: "FB", LB: "FB", RWB: "FB", LWB: "FB", RB5: "FB", LB5: "FB",
  CB: "CB", RCB: "CB", LCB: "CB", RCB3: "CB", LCB3: "CB",
  DMF: "DMF", RDMF: "DMF", LDMF: "DMF",
  RCMF: "B2B", LCMF: "B2B", RCMF3: "B2B", LCMF3: "B2B",
  AMF: "AM",
  RAMF: "WING", LAMF: "WING", RW: "WING", LW: "WING", RWF: "WING", LWF: "WING", RM: "WING", LM: "WING",
  CF: "CF", RCF: "CF", LCF: "CF", SS: "CF",
};

test("cada código de Wyscout cae en su cohorte", () => {
  for (const [codigo, cohorte] of Object.entries(VOCABULARIO)) {
    assert.equal(cohortOf(codigo), cohorte, `${codigo} debería puntuarse como ${cohorte}`);
  }
});

test("ningún código del vocabulario se queda sin rol", () => {
  const huerfanos = Object.keys(VOCABULARIO).filter((codigo) => !roleForPosition(codigo));
  assert.deepEqual(huerfanos, [], `sin rol: ${huerfanos.join(", ")} · caerían en Otros y no saldrían en ninguna lista`);
});

test("los carriles de una línea de cinco son laterales", () => {
  // Wyscout marca con 5 el carril de un 3-5-2; antes caían en "Otros".
  assert.equal(cohortOf("RB5"), "FB");
  assert.equal(cohortOf("LB5"), "FB");
});

test("el segundo delantero es delantero", () => {
  assert.equal(cohortOf("SS"), "CF");
});

test("manda la primera posición de la lista, que es la principal", () => {
  // Wyscout escribe varias separadas por coma, de más a menos habitual.
  assert.equal(cohortOf("RDMF, RCMF"), "DMF");
  assert.equal(cohortOf("RCMF, RDMF"), "B2B", "un interior que también hace de pivote se puntúa como interior");
});

test("los nombres largos en inglés también se reconocen", () => {
  // Por si una base llega sin pasar por la traducción del puente.
  assert.equal(cohortOf("Centre Midfielder"), "DMF");
  assert.equal(cohortOf("Second Striker"), "CF");
  assert.equal(cohortOf("Left Wing Back"), "FB");
});

test("una posición vacía o desconocida no se inventa un puesto", () => {
  assert.equal(cohortOf(""), "OTHER");
  assert.equal(cohortOf("Entrenador"), "OTHER");
});
