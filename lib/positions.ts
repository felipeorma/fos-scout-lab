import { t, tf } from "./i18n.ts";

export const POSITION_ROLES = [
  "Goalkeeper",
  "Fullback",
  "Defender",
  "Defensive Midfielder",
  "Box2Box Midfielder",
  "Attack Midfielder",
  "Wingers",
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
  "LEFT-BACK": "Fullback", "RIGHT-BACK": "Fullback", "WING-BACK": "Fullback", FULLBACK: "Fullback",
  LCB: "Defender", CB: "Defender", RCB: "Defender", D: "Defender", DC: "Defender",
  DEFENDER: "Defender", "CENTRE-BACK": "Defender", "CENTER-BACK": "Defender",
  CM: "Defensive Midfielder", CMF: "Defensive Midfielder", DMF: "Defensive Midfielder",
  CDM: "Defensive Midfielder", DM: "Defensive Midfielder", LDMF: "Defensive Midfielder",
  RDMF: "Defensive Midfielder", M: "Defensive Midfielder", MIDFIELDER: "Defensive Midfielder",
  "CENTRAL MIDFIELDER": "Defensive Midfielder", "DEFENSIVE MIDFIELDER": "Defensive Midfielder",
  LCMF: "Box2Box Midfielder", RCMF: "Box2Box Midfielder",
  AMF: "Attack Midfielder", CAM: "Attack Midfielder", AM: "Attack Midfielder",
  "ATTACKING MIDFIELDER": "Attack Midfielder", "ATTACK MIDFIELDER": "Attack Midfielder",
  LM: "Wingers", RM: "Wingers", "LEFT MIDFIELDER": "Wingers", "RIGHT MIDFIELDER": "Wingers",
  LW: "Wingers", LWF: "Wingers", RW: "Wingers", RWF: "Wingers", W: "Wingers",
  WINGER: "Wingers", "LEFT WINGER": "Wingers", "RIGHT WINGER": "Wingers", WING: "Wingers",
  LAMF: "Wingers", RAMF: "Wingers",
  CF: "Forward", ST: "Forward", F: "Forward", S: "Forward", FORWARD: "Forward",
  STRIKER: "Forward", "CENTRE-FORWARD": "Forward", "CENTER-FORWARD": "Forward",
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

export function splitPlayerPositions(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((position) => position.trim())
    .filter((position) => position && position.toLocaleLowerCase("en") !== "nan");
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

export function roleForPosition(value: unknown): PositionRole | null {
  const key = lookupKey(String(value ?? ""));
  return POSITION_MAP[key] ?? null;
}

export function playerPositions(value: unknown): PlayerPosition[] {
  return splitPlayerPositions(value).map((code, order) => ({
    code,
    role: roleForPosition(code) ?? code,
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
  return [...new Set(splitPlayerPositions(value).map((code): PositionSide => {
    const key = lookupKey(code);
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

export function roleCohort(role: PositionRole | null) {
  if (role === "Goalkeeper") return "GK";
  if (role === "Defender") return "CB";
  if (role === "Fullback") return "FB";
  if (role === "Defensive Midfielder") return "DMF";
  if (role === "Box2Box Midfielder") return "B2B";
  if (role === "Wingers") return "WING";
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
  AM: "Attack Midfielder",
  CF: "Forward",
};

export function selectedCohortPosition(cohort: string, detectedPosition: string) {
  if (cohort === "AUTO") return detectedPosition;
  return COHORT_POSITION_LABELS[cohort] ?? detectedPosition;
}
