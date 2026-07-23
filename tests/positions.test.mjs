import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPlayerPositions,
  mergePlayerPositions,
  playerPositions,
  positionRoles,
  primaryPositionRole,
  roleCohort,
  selectedCohortPosition,
} from "../lib/positions.ts";
import { similarityMetricGroup } from "../lib/similarityMetricGroups.ts";

test("normaliza y conserva posiciones principal, secundaria y terciaria", () => {
  assert.deepEqual(positionRoles("RWF, AMF, CF"), ["Wingers", "Attack Midfielder", "Forward"]);
  assert.equal(primaryPositionRole("RWF, AMF, CF"), "Wingers");
  assert.deepEqual(playerPositions("RWF, AMF, CF").map(({ code, role, order }) => ({ code, role, order })), [
    { code: "RWF", role: "Wingers", order: 0 },
    { code: "AMF", role: "Attack Midfielder", order: 1 },
    { code: "CF", role: "Forward", order: 2 },
  ]);
  assert.equal(formatPlayerPositions("RWF, AMF, CF"), "Wingers (RWF) · 2ª Attack Midfielder (AMF) · 3ª Forward (CF)");
});

test("acepta abreviaturas y nombres completos del mapa Wyscout", () => {
  assert.deepEqual(positionRoles("Centre-Back, Right-Back, RCMF"), ["Defender", "Fullback", "Box2Box Midfielder"]);
  assert.equal(roleCohort(primaryPositionRole("CM, CAM")), "DMF");
});

test("al combinar temporadas conserva primero las posiciones de la base más reciente", () => {
  assert.equal(mergePlayerPositions(["RWF, AMF", "CF, RWF"]), "RWF, AMF, CF");
});

test("la posición de la ficha sigue la cohorte seleccionada manualmente", () => {
  assert.equal(selectedCohortPosition("CF", "Defensive Midfielder (DMF)"), "Forward");
  assert.equal(selectedCohortPosition("WING", "Forward (CF)"), "Wingers");
  assert.equal(selectedCohortPosition("AUTO", "Defender (CB)"), "Defender (CB)");
});

test("separa finalización y defensa en grupos visuales distintos", () => {
  assert.equal(similarityMetricGroup({ key: "Goals per 90", label: "Goles", group: 0 }).id, "finishing");
  assert.equal(similarityMetricGroup({ key: "Defensive duels won, %", label: "Duelos defensivos", group: 0 }).id, "defending");
  assert.equal(similarityMetricGroup({ key: "Aerial duels won, %", label: "Duelos aéreos", group: 1 }, "CF").id, "finishing");
  assert.equal(similarityMetricGroup({ key: "Aerial duels won, %", label: "Duelos aéreos", group: 0 }, "WING").id, "finishing");
  assert.equal(similarityMetricGroup({ key: "Aerial duels won, %", label: "Duelos aéreos", group: 1 }, "GK").id, "defending");
  assert.equal(similarityMetricGroup({ key: "Aerial duels won, %", label: "Duelos aéreos", group: 0 }, "CB").id, "defending");
});
