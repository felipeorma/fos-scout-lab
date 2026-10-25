import { t, tf } from "./i18n.ts";

export const POSITION_ROLES = [
  "Goalkeeper",
  "Fullback",
  "Defender",
  "Defensive Midfielder",
  "Box2Box Midfielder",
  "Attack Midfielder",
  "Wingers",
  "Direct Winger",
  "Forward",
] as const;

export type PositionRole = typeof POSITION_ROLES[number];

export type PlayerPosition = {
  code: string;
  role: PositionRole | string;
  order: number;
};

const POSITION_MAP: Record<string, PositionRole> = {
  GK: "Goalkeeper", G: "Goalkeeper", GOALKEEPER: "Goalkeeper",
  LB: "Fullback", LWB: "Fullback", RB: "Fullback", RWB: "Fullback",
  // Wyscout escribe el carril de una línea de cinco con el sufijo 5; sin
  // estos dos, esos laterales caían en "Otros" y no salían en ninguna lista.
  LB5: "Fullback", RB5: "Fullback",
  "LEFT-BACK": "Fullback", "RIGHT-BACK": "Fullback", "WING-BACK": "Fullback", FULLBACK: "Fullback",
  "LEFT WING BACK": "Fullback", "RIGHT WING BACK": "Fullback",
  LCB: "Defender", CB: "Defender", RCB: "Defender", D: "Defender", DC: "Defender",
  LCB3: "Defender", RCB3: "Defender", CB3: "Defender",
  DEFENDER: "Defender", "CENTRE-BACK": "Defender", "CENTER-BACK": "Defender",
  CM: "Defensive Midfielder", CMF: "Defensive Midfielder", DMF: "Defensive Midfielder",
  "CENTRE MIDFIELDER": "Defensive Midfielder", "CENTER MIDFIELDER": "Defensive Midfielder",
  CDM: "Defensive Midfielder", DM: "Defensive Midfielder", LDMF: "Defensive Midfielder",
  RDMF: "Defensive Midfielder", M: "Defensive Midfielder", MIDFIELDER: "Defensive Midfielder",
  // Códigos de SkillCorner que Wyscout no usa
  LDM: "Defensive Midfielder", RDM: "Defensive Midfielder",
  "CENTRAL MIDFIELDER": "Defensive Midfielder", "DEFENSIVE MIDFIELDER": "Defensive Midfielder",
  LCMF: "Box2Box Midfielder", RCMF: "Box2Box Midfielder",
  LCMF3: "Box2Box Midfielder", RCMF3: "Box2Box Midfielder",
  AMF: "Attack Midfielder", CAM: "Attack Midfielder", AM: "Attack Midfielder",
  "ATTACKING MIDFIELDER": "Attack Midfielder", "ATTACK MIDFIELDER": "Attack Midfielder",
  LM: "Wingers", RM: "Wingers", "LEFT MIDFIELDER": "Wingers", "RIGHT MIDFIELDER": "Wingers",
  LW: "Wingers", LWF: "Wingers", RW: "Wingers", RWF: "Wingers", W: "Wingers",
  WINGER: "Wingers", "LEFT WINGER": "Wingers", "RIGHT WINGER": "Wingers", WING: "Wingers",
  LAMF: "Wingers", RAMF: "Wingers", LF: "Wingers", RF: "Wingers",
  CF: "Forward", ST: "Forward", F: "Forward", S: "Forward", FORWARD: "Forward",
  LCF: "Forward", RCF: "Forward",
  // El segundo delantero de Wyscout. Sin él, un SS se perdía igual que los
  // carriles de cinco.
  SS: "Forward", "SECOND STRIKER": "Forward", "SECONDARY STRIKER": "Forward",
  STRIKER: "Forward", "CENTRE-FORWARD": "Forward", "CENTER-FORWARD": "Forward",
  /*
   * Posiciones escritas en texto: las de los títulos de los informes
   * ("Defensive Midfield", "Wing (Centre-Forward)"), las de otros exports y
   * los nombres de rol con los que la propia app escribe la posición
   * ("Box2Box Midfielder (RCMF)"). Antes caían todas en "Otros" y el jugador
   * se medía con el perfil genérico.
   */
  "DEFENSIVE MIDFIELD": "Defensive Midfielder", "CENTRAL MIDFIELD": "Defensive Midfielder",
  "CENTRE MIDFIELD": "Defensive Midfielder", "CENTER MIDFIELD": "Defensive Midfielder",
  "HOLDING MIDFIELDER": "Defensive Midfielder", "BOX2BOX MIDFIELDER": "Box2Box Midfielder",
  "BOX-TO-BOX MIDFIELDER": "Box2Box Midfielder", "BOX TO BOX MIDFIELDER": "Box2Box Midfielder",
  "ATTACKING MIDFIELD": "Attack Midfielder", "ATTACK MIDFIELD": "Attack Midfielder",
  "LEFT WING": "Wingers", "RIGHT WING": "Wingers", WINGERS: "Wingers", "DIRECT WINGER": "Wingers",
  "CENTRE FORWARD": "Forward", "CENTER FORWARD": "Forward",
  "LEFT BACK": "Fullback", "RIGHT BACK": "Fullback", "FULL-BACK": "Fullback", "FULL BACK": "Fullback",
  WINGBACK: "Fullback", "WING BACK": "Fullback",
  "CENTRE BACK": "Defender", "CENTER BACK": "Defender", "CENTRAL DEFENDER": "Defender",
  // En español, como los escribe un scout a mano.
  PORTERO: "Goalkeeper", ARQUERO: "Goalkeeper", LATERAL: "Fullback", CARRILERO: "Fullback",
  CENTRAL: "Defender", "DEFENSA CENTRAL": "Defender", DEFENSA: "Defender", PIVOTE: "Defensive Midfielder",
  MEDIOCENTRO: "Defensive Midfielder", VOLANTE: "Defensive Midfielder", INTERIOR: "Box2Box Midfielder",
  MEDIAPUNTA: "Attack Midfielder", ENGANCHE: "Attack Midfielder", EXTREMO: "Wingers",
  DELANTERO: "Forward", "DELANTERO CENTRO": "Forward", "SEGUNDO DELANTERO": "Forward",
};

function lookupKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/*
 * Las posiciones vienen separadas por comas (Wyscout) o por " · ", que es
 * como las escribe la app al formatearlas ("Forward (CF) · 2ª Wingers (LW)").
 * Los ordinales de la app ("2ª", "3ª", "2nd") se quitan: son orden, no puesto.
 */
const ORDINAL = /^(\d+\s*[ªº]|\d+(st|nd|rd|th))\s+/i;

export function splitPlayerPositions(value: unknown) {
  return String(value ?? "")
    .split(/,|\s·\s/)
    .map((position) => position.trim().replace(ORDINAL, ""))
    .filter((position) => position && position !== "—" && position.toLocaleLowerCase("en") !== "nan");
}

export function mergePlayerPositions(values: unknown[]) {
  const seen = new Set<string>();
  const positions: string[] = [];
  for (const value of values) {
    for (const position of splitPlayerPositions(value)) {
      const key = lookupKey(position);
      if (seen.has(key)) continue;
      seen.add(key);
      positions.push(position);
    }
  }
  return positions.join(", ");
}

const CON_PARENTESIS = /^(.*?)\s*\(([^)]+)\)\s*$/;

/** El código de una posición escrita como "Forward (CF)": el de dentro del paréntesis; si no lo hay, ella misma. */
function codigoDe(texto: string) {
  return texto.match(CON_PARENTESIS)?.[2]?.trim() || texto;
}

export function roleForPosition(value: unknown): PositionRole | null {
  const texto = String(value ?? "");
  const directo = POSITION_MAP[lookupKey(texto)];
  if (directo) return directo;
  // "Forward (CF)", "Wing (Centre-Forward)": manda el código de dentro del
  // paréntesis, que es más preciso; si no se conoce, el texto de fuera.
  const conParentesis = texto.match(CON_PARENTESIS);
  if (conParentesis) return POSITION_MAP[lookupKey(conParentesis[2])] ?? POSITION_MAP[lookupKey(conParentesis[1])] ?? null;
  return null;
}

export function playerPositions(value: unknown): PlayerPosition[] {
  return splitPlayerPositions(value).map((texto, order) => ({
    code: codigoDe(texto),
    role: roleForPosition(texto) ?? texto,
    order,
  }));
}

export function positionRoles(value: unknown): PositionRole[] {
  return [...new Set(splitPlayerPositions(value).map(roleForPosition).filter((role): role is PositionRole => Boolean(role)))];
}

export function primaryPositionRole(value: unknown) {
  return roleForPosition(splitPlayerPositions(value)[0] ?? "");
}

export type PositionSide = "left" | "right" | "center";

// Los códigos Wyscout llevan la lateralidad en el prefijo: LW/LB/LCMF juegan
// por izquierda, RWF/RB/RDMF por derecha; el resto ocupa el eje central.
export function positionSides(value: unknown): PositionSide[] {
  return [...new Set(splitPlayerPositions(value).map((texto): PositionSide => {
    const key = lookupKey(codigoDe(texto));
    if (/^L/.test(key)) return "left";
    if (/^R/.test(key)) return "right";
    return "center";
  }))];
}

export function formatPlayerPositions(value: unknown) {
  const positions = playerPositions(value);
  if (!positions.length) return "—";
  return positions.map((position, index) => {
    const prefix = index === 0 ? "" : index === 1 ? `${t("2ª")} ` : index === 2 ? `${t("3ª")} ` : `${tf("{n}ª", { n: index + 1 })} `;
    const code = lookupKey(position.code) === lookupKey(position.role) ? "" : ` (${position.code})`;
    return `${prefix}${position.role}${code}`;
  }).join(" · ");
}

/**
 * "Extremo directo" es una lente de análisis, no una posición que ningún
 * export escriba: se compara contra los extremos, pero con su set de métricas.
 * Por eso nunca sale de la detección automática, solo del filtro manual.
 */
export function roleDetectionEquivalent(role: string | null) {
  return role === "Direct Winger" ? "Wingers" : role;
}

export function roleCohort(role: PositionRole | null) {
  if (role === "Goalkeeper") return "GK";
  if (role === "Defender") return "CB";
  if (role === "Fullback") return "FB";
  if (role === "Defensive Midfielder") return "DMF";
  if (role === "Box2Box Midfielder") return "B2B";
  if (role === "Wingers") return "WING";
  if (role === "Direct Winger") return "DWING";
  if (role === "Attack Midfielder") return "AM";
  if (role === "Forward") return "CF";
  return "OTHER";
}

const COHORT_POSITION_LABELS: Record<string, PositionRole> = {
  GK: "Goalkeeper",
  CB: "Defender",
  FB: "Fullback",
  MID: "Defensive Midfielder",
  DMF: "Defensive Midfielder",
  B2B: "Box2Box Midfielder",
  WING: "Wingers",
  DWING: "Wingers",
  AM: "Attack Midfielder",
  CF: "Forward",
};

export function selectedCohortPosition(cohort: string, detectedPosition: string) {
  if (cohort === "AUTO") return detectedPosition;
  return COHORT_POSITION_LABELS[cohort] ?? detectedPosition;
}
