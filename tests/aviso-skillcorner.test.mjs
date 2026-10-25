import assert from "node:assert/strict";
import test from "node:test";
import { avisoSkillcorner } from "../lib/avisoSkillcorner.ts";

/** El aviso de la ficha cuando SkillCorner no publica la liga, o solo sus físicos. */

const base = (fileName, provider, rows = [{ Player: "X" }]) => ({ fileName, provider, season: 0, headers: Object.keys(rows[0]), rows });

test("sin edición de SkillCorner en esa temporada: sin físicos ni desmarques, y de dónde vienen los que trae", () => {
  const bases = [base("StatsBomb · USL Championship 2026", "statsbomb"), base("StatsBomb · USL Championship 2025", "statsbomb"),
    base("SkillCorner · USL Championship 2025", "skillcorner", [{ Player: "X", "PSV-99 (SC)": 29 }])];
  const aviso = avisoSkillcorner(bases, ["USL Championship"], "2026", "SkillCorner · USL Championship 2025, StatsBomb · USL Championship 2025, StatsBomb · USL Championship 2026");
  assert.deepEqual(aviso, { tipo: "sin_liga", liga: "USL Championship", temporada: "2026", fisicosDe: ["USL Championship 2025"] });
});

test("con edición pero solo físicos; con desmarques, nada que avisar; un Excel de Wyscout, tampoco", () => {
  const soloFisico = [base("StatsBomb · Veikkausliiga 2026", "statsbomb"), base("SkillCorner · Veikkausliiga 2026", "skillcorner", [{ Player: "X", "PSV-99 (SC)": 30, "Runs in behind P30 (SC)": "" }])];
  assert.equal(avisoSkillcorner(soloFisico, ["Veikkausliiga"], "2026", "").tipo, "solo_fisico");
  const completo = [base("StatsBomb · Canadian Premier League 2026", "statsbomb"), base("SkillCorner · Canadian Premier League 2026", "skillcorner", [{ Player: "X", "Runs in behind P30 (SC)": 1.2 }])];
  assert.equal(avisoSkillcorner(completo, ["Canadian Premier League"], "2026", ""), null);
  assert.equal(avisoSkillcorner([base("canadians.xlsx", "wyscout")], ["canadians"], "", ""), null);
});
