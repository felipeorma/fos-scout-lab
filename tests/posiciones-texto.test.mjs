import assert from "node:assert/strict";
import test from "node:test";
import { cohortOf } from "../lib/scouting.ts";
import { formatPlayerPositions, positionSides } from "../lib/positions.ts";

/**
 * Posiciones que no son códigos de Wyscout: texto libre, las de los títulos de
 * los informes y la forma en que la propia app las escribe. Antes caían en
 * "Otros" y el jugador se medía con el perfil genérico.
 */

test("texto en inglés y en español", () => {
  const casos = {
    "Defensive Midfield": "DMF", "Central Midfield": "DMF", "Attacking Midfield": "AM", "Left Wing": "WING",
    "Centre Back": "CB", "Right-Back": "FB", "Full Back": "FB", "Centre Forward": "CF",
    Portero: "GK", Lateral: "FB", Central: "CB", Pivote: "DMF", Interior: "B2B", Mediapunta: "AM", Extremo: "WING", Delantero: "CF",
  };
  for (const [texto, cohorte] of Object.entries(casos)) assert.equal(cohortOf(texto), cohorte, texto);
});

test("como las escribe la app: rol, código entre paréntesis, ordinal y ' · '", () => {
  assert.equal(cohortOf("Forward (CF)"), "CF");
  assert.equal(cohortOf("Box2Box Midfielder (RCMF) · 2ª Defensive Midfielder (RDMF)"), "B2B");
  assert.equal(cohortOf("Wingers (LW) · 2nd Forward (CF)"), "WING");
  assert.equal(cohortOf("Wing (Centre-Forward)"), "CF", "el paréntesis manda");
  assert.deepEqual(positionSides("Wingers (LW) · 2ª Fullback (LB)"), ["left"]);
  // Volver a formatear lo ya formateado no duplica el paréntesis.
  assert.equal(formatPlayerPositions("Forward (CF)"), "Forward (CF)");
});

test("los códigos de Wyscout siguen igual", () => {
  assert.equal(cohortOf("RCMF3, LCMF3"), "B2B");
  assert.equal(cohortOf("LWF, CF"), "WING");
  assert.equal(cohortOf(""), "OTHER");
  assert.equal(cohortOf("—"), "OTHER");
});
