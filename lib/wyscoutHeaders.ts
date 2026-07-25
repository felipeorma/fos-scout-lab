/**
 * Cabeceras de Wyscout en español y su equivalente en inglés.
 *
 * Wyscout exporta la misma plantilla en varios idiomas: mismas columnas, mismo
 * orden, distinto rótulo. Al cargar se renombran al nombre inglés canónico, de
 * modo que métricas, percentiles y combinación de bases funcionan igual con
 * archivos en cualquiera de los dos idiomas y se pueden unir entre sí.
 *
 * Tabla derivada comparando dos exportaciones reales de la misma plantilla.
 */
export const WYSCOUT_HEADERS_ES_EN: Record<string, string> = {
  "Jugador": "Player",
  "Equipo": "Team",
  "Posición específica": "Position",
  "Edad": "Age",
  "Valor de mercado (Transfermarkt)": "Market value",
  "Vencimiento contrato": "Contract expires",
  "Partidos jugados": "Matches played",
  "Minutos jugados": "Minutes played",
  "Goles": "Goals",
  "Asistencias": "Assists",
  "Duelos/90": "Duels per 90",
  "Duelos ganados, %": "Duels won, %",
  "País de nacimiento": "Birth country",
  "Pasaporte": "Passport country",
  "Pie": "Foot",
  "Altura": "Height",
  "Peso": "Weight",
  "En prestamo": "On loan",
  "Acciones defensivas realizadas/90": "Successful defensive actions per 90",
  "Duelos defensivos/90": "Defensive duels per 90",
  "Duelos defensivos ganados, %": "Defensive duels won, %",
  "Duelos aéreos en los 90": "Aerial duels per 90",
  "Duelos aéreos ganados, %": "Aerial duels won, %",
  "Entradas/90": "Sliding tackles per 90",
  "Posesión conquistada después de una entrada": "PAdj Sliding tackles",
  "Tiros interceptados/90": "Shots blocked per 90",
  "Interceptaciones/90": "Interceptions per 90",
  "Posesión conquistada después de una interceptación": "PAdj Interceptions",
  "Faltas/90": "Fouls per 90",
  "Tarjetas amarillas": "Yellow cards",
  "Tarjetas amarillas/90": "Yellow cards per 90",
  "Tarjetas rojas": "Red cards",
  "Tarjetas rojas/90": "Red cards per 90",
  "Acciones de ataque exitosas/90": "Successful attacking actions per 90",
  "Goles/90": "Goals per 90",
  "Goles (excepto los penaltis)": "Non-penalty goals",
  "Goles, excepto los penaltis/90": "Non-penalty goals per 90",
  "xG/90": "xG per 90",
  "Goles de cabeza": "Head goals",
  "Goles de cabeza/90": "Head goals per 90",
  "Remates": "Shots",
  "Remates/90": "Shots per 90",
  "Tiros a la portería, %": "Shots on target, %",
  "Goles hechos, %": "Goal conversion, %",
  "Asistencias/90": "Assists per 90",
  "xA/90": "xA per 90",
  "Centros/90": "Crosses per 90",
  "Precisión centros, %": "Accurate crosses, %",
  "Centros desde la banda izquierda/90": "Crosses from left flank per 90",
  "Precisión centros desde la banda izquierda, %": "Accurate crosses from left flank, %",
  "Centros desde la banda derecha/90": "Crosses from right flank per 90",
  "Precisión centros desde la banda derecha, %": "Accurate crosses from right flank, %",
  "Centros al área pequeña/90": "Crosses to goalie box per 90",
  "Regates/90": "Dribbles per 90",
  "Regates realizados, %": "Successful dribbles, %",
  "Duelos atacantes/90": "Offensive duels per 90",
  "Duelos atacantes ganados, %": "Offensive duels won, %",
  "Toques en el área de penalti/90": "Touches in box per 90",
  "Carreras en progresión/90": "Progressive runs per 90",
  "Pases recibidos /90": "Received passes per 90",
  "Pases largos recibidos/90": "Received long passes per 90",
  "Faltas recibidas/90": "Fouls suffered per 90",
  "Pases/90": "Passes per 90",
  "Precisión pases, %": "Accurate passes, %",
  "Pases hacia adelante/90": "Forward passes per 90",
  "Precisión pases hacia adelante, %": "Accurate forward passes, %",
  "Pases hacia atrás/90": "Back passes per 90",
  "Precision pases hacia atrás, %": "Accurate back passes, %",
  "Pases laterales/90": "Lateral passes per 90",
  "Precisión pases laterales, %": "Accurate lateral passes, %",
  "Pases cortos / medios /90": "Short / medium passes per 90",
  "Precisión pases cortos / medios, %": "Accurate short / medium passes, %",
  "Pases largos/90": "Long passes per 90",
  "Precisión pases largos, %": "Accurate long passes, %",
  "Longitud media pases, m": "Average pass length, m",
  "Longitud media pases largos, m": "Average long pass length, m",
  "Asistencias/90_1": "Shot assists per 90",
  "Second assists/90": "Second assists per 90",
  "Third assists/90": "Third assists per 90",
  "Desmarques/90": "Smart passes per 90",
  "Precisión desmarques, %": "Accurate smart passes, %",
  "Jugadas claves/90": "Key passes per 90",
  "Pases en el último tercio/90": "Passes to final third per 90",
  "Precisión pases en el último tercio, %": "Accurate passes to final third, %",
  "Pases al área de penalti/90": "Passes to penalty area per 90",
  "Pases hacía el área pequeña, %": "Accurate passes to penalty area, %",
  "Pases en profundidad/90": "Through passes per 90",
  "Precisión pases en profundidad, %": "Accurate through passes, %",
  "Ataque en profundidad/90": "Deep completions per 90",
  "Centros desde el último tercio/90": "Deep completed crosses per 90",
  "Pases progresivos/90": "Progressive passes per 90",
  "Precisión pases progresivos, %": "Accurate progressive passes, %",
  "Goles recibidos": "Conceded goals",
  "Goles recibidos/90": "Conceded goals per 90",
  "Remates en contra": "Shots against",
  "Remates en contra/90": "Shots against per 90",
  "Porterías imbatidas en los 90": "Clean sheets",
  "Paradas, %": "Save rate, %",
  "xG en contra": "xG against",
  "xG en contra/90": "xG against per 90",
  "Goles evitados": "Prevented goals",
  "Goles evitados/90": "Prevented goals per 90",
  "Pases hacía atrás recibidos del arquero/90": "Back passes received as GK per 90",
  "Salidas/90": "Exits per 90",
  "Duelos aéreos en los 90_1": "Aerial duels per 90_1",
  "Tiros libres/90": "Free kicks per 90",
  "Tiros libres directos/90": "Direct free kicks per 90",
  "Tiros libres directos, %": "Direct free kicks on target, %",
  "Córneres/90": "Corners per 90",
  "Penaltis a favor": "Penalties taken",
  "Penaltis realizados, %": "Penalty conversion, %",
};

function normalizeKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const LOOKUP = new Map(Object.entries(WYSCOUT_HEADERS_ES_EN).map(([es, en]) => [normalizeKey(es), en]));

/** Nombre inglés canónico de una cabecera, o la propia si ya lo es. */
export function canonicalHeader(header: string) {
  return LOOKUP.get(normalizeKey(header)) ?? header;
}

/** Renombra las cabeceras de una fila al nombre canónico en inglés. */
export function canonicalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = canonicalHeader(key);
    // Si ambas variantes coexisten, gana la que trae dato.
    if (out[canonical] === undefined || out[canonical] === "") out[canonical] = value;
  }
  return out;
}
