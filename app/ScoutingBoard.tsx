"use client";

import { useMemo, useState } from "react";
import { buildPlayerReport, type DataRow } from "@/lib/scouting";
import { t, tf } from "@/lib/i18n";

/**
 * Mesa de detección mensual.
 *
 * No es un informe de un jugador: es el paso anterior. Se cargan las ligas del
 * mes, se recorre la base entera y se levantan los perfiles cuyos números
 * llaman la atención, para pasarlos a identificación. Por eso ordena por
 * índice dentro de cada posición y marca al que destaca en algo concreto,
 * no al que es bueno en todo.
 */

/**
 * Mapa de posiciones de Maldonado. Distingue lado —lo que la cohorte de
 * métricas no hace— porque para ellos un lateral izquierdo y uno derecho son
 * puestos distintos a la hora de buscar.
 *
 * Ojo con la separación: se AGRUPA por este mapa, pero el índice se sigue
 * calculando contra la cohorte de métricas. Comparar a un lateral izquierdo
 * solo contra los ocho de la base daría percentiles sin valor; contra todos
 * los laterales, sí.
 */
const MAPA_MALDONADO: Record<string, string> = {
  GK: "Arquero",
  LB: "Lateral Izquierdo", LWB: "Lateral Izquierdo", RB: "Lateral Derecho", RWB: "Lateral Derecho",
  LCB: "Defensor Central Izquierdo", CB: "Defensor Central", RCB: "Defensor Central Derecho",
  CM: "Contensión", CMF: "Contensión", DMF: "Contensión", CDM: "Contensión", DM: "Contensión",
  LDMF: "Contensión", RDMF: "Contensión",
  LCMF: "Interior Izquierdo", RCMF: "Interior Derecho",
  AMF: "Enganche", CAM: "Enganche", AM: "Enganche", MEDIAPUNTA: "Enganche",
  LM: "Extremo Izquierdo", RM: "Extremo Derecho", LW: "Extremo Izquierdo", LWF: "Extremo Izquierdo",
  RW: "Extremo Derecho", RWF: "Extremo Derecho",
  LAMF: "Interior Izquierdo", RAMF: "Interior Derecho",
  CF: "Delantero",
  // Añadidos al mapa original: Wyscout y StatsBomb marcan al delantero por
  // lado y el mapa de Maldonado no los contempla. Todos son el mismo puesto.
  RCF: "Delantero", LCF: "Delantero", ST: "Delantero", SS: "Delantero", CFW: "Delantero",
};

/** Orden de lectura de una alineación: portería, defensa, medio, ataque. */
const ORDEN_MALDONADO = [
  "Arquero", "Defensor Central Izquierdo", "Defensor Central", "Defensor Central Derecho",
  "Lateral Izquierdo", "Lateral Derecho", "Contensión", "Interior Izquierdo", "Interior Derecho",
  "Enganche", "Extremo Izquierdo", "Extremo Derecho", "Delantero",
];

function puestoMaldonado(posicion: unknown) {
  const bruta = String(posicion ?? "").split(",")[0].trim().toUpperCase();
  if (!bruta) return "";
  return MAPA_MALDONADO[bruta] ?? MAPA_MALDONADO[bruta.replace(/[^A-Z]/g, "")] ?? "";
}

type Ficha = {
  indice: number;
  jugador: string;
  equipo: string;
  edad: number;
  minutos: number;
  perfil: string;
  puesto: string;
  puntuacion: number;
  destacadas: Array<{ label: string; percentile: number }>;
  fila: number;
};

function numero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function ScoutingBoard({ rows, minimumMinutes, onSelectPlayer }: {
  rows: DataRow[];
  minimumMinutes: number;
  onSelectPlayer?: (indice: number) => void;
}) {
  const [edadMax, setEdadMax] = useState(0);
  const [minutosMin, setMinutosMin] = useState(minimumMinutes);
  const [perfil, setPerfil] = useState("TODOS");
  const [soloJoven, setSoloJoven] = useState(false);

  const fichas = useMemo(() => {
    const salida: Ficha[] = [];
    for (let indice = 0; indice < rows.length; indice += 1) {
      const informe = buildPlayerReport(rows, indice, minutosMin, "AUTO");
      if (!informe || informe.metrics.length < 4) continue;
      const minutos = numero(rows[indice]["Minutes played"]);
      if (Number.isFinite(minutos) && minutos < minutosMin) continue;
      salida.push({
        indice,
        jugador: informe.player,
        equipo: informe.team,
        edad: numero(rows[indice].Age),
        minutos: Number.isFinite(minutos) ? minutos : 0,
        perfil: informe.cohort,
        puesto: puestoMaldonado(rows[indice].Position) || informe.cohort,
        puntuacion: informe.score,
        // Lo que llama la atención: no el que es correcto en todo, sino el que
        // sobresale en algo. Un P90 aislado es una señal de scouting.
        destacadas: informe.metrics.filter((m) => m.percentile >= 88).sort((a, b) => b.percentile - a.percentile).slice(0, 3),
        fila: indice,
      });
    }
    return salida;
  }, [rows, minutosMin]);

  const visibles = useMemo(() => {
    let lista = fichas;
    if (perfil !== "TODOS") lista = lista.filter((f) => f.puesto === perfil);
    if (edadMax > 0) lista = lista.filter((f) => Number.isFinite(f.edad) && f.edad <= edadMax);
    if (soloJoven) lista = lista.filter((f) => Number.isFinite(f.edad) && f.edad <= 23);
    return [...lista].sort((a, b) => b.puntuacion - a.puntuacion);
  }, [fichas, perfil, edadMax, soloJoven]);

  const porPerfil = useMemo(() => {
    const mapa = new Map<string, Ficha[]>();
    for (const ficha of visibles) mapa.set(ficha.puesto, [...(mapa.get(ficha.puesto) ?? []), ficha]);
    return mapa;
  }, [visibles]);

  return <section className="scouting-board">
    <header>
      <div>
        <span>{t("MESA DE DETECCIÓN")}</span>
        <h2>{t("Perfiles que llaman la atención")}</h2>
        <p>{t("Recorre la base entera, ordena cada posición por índice global y marca en qué destaca cada jugador. El paso previo a identificación, no el informe.")}</p>
      </div>
      <b>{tf("{n} jugadores", { n: visibles.length })}</b>
    </header>

    <div className="board-filters">
      <label><span>{t("Perfil")}</span>
        <select value={perfil} onChange={(event) => setPerfil(event.target.value)}>
          <option value="TODOS">{t("Todos")}</option>
          {ORDEN_MALDONADO.map((puesto) => <option key={puesto} value={puesto}>{puesto}</option>)}
        </select>
      </label>
      <label><span>{t("Mín. minutos")}</span>
        <input type="number" min="0" step="100" value={minutosMin} onChange={(event) => setMinutosMin(Number(event.target.value))} />
      </label>
      <label><span>{t("Edad máxima")}</span>
        <input type="number" min="0" max="45" value={edadMax || ""} placeholder="—" onChange={(event) => setEdadMax(Number(event.target.value))} />
      </label>
      <button type="button" className={soloJoven ? "on" : ""} onClick={() => setSoloJoven(!soloJoven)}>{t("Solo sub-23")}</button>
    </div>

    {[...porPerfil.entries()]
      .sort((a, b) => (ORDEN_MALDONADO.indexOf(a[0]) + 99) % 199 - (ORDEN_MALDONADO.indexOf(b[0]) + 99) % 199)
      .map(([id, lista]) => (
      <div key={id} className="board-group">
        <h3>{id} <i>{lista.length}</i></h3>
        <table>
          <thead><tr>
            <th>#</th><th>{t("Jugador")}</th><th>{t("Equipo")}</th>
            <th>{t("Edad")}</th><th>{t("Min")}</th><th>{t("Índice")}</th><th>{t("Destaca en")}</th>
          </tr></thead>
          <tbody>
            {lista.slice(0, 15).map((ficha, posicion) => (
              <tr key={ficha.indice} onClick={() => onSelectPlayer?.(ficha.fila)} className={onSelectPlayer ? "clicable" : ""}>
                <td>{posicion + 1}</td>
                <td className="board-name">{ficha.jugador}</td>
                <td>{ficha.equipo}</td>
                <td>{Number.isFinite(ficha.edad) ? ficha.edad : "—"}</td>
                <td>{ficha.minutos ? Math.round(ficha.minutos) : "—"}</td>
                <td><b>{ficha.puntuacion}</b></td>
                <td className="board-flags">
                  {ficha.destacadas.length
                    ? ficha.destacadas.map((m) => <em key={m.label}>{t(m.label)} <u>P{m.percentile}</u></em>)
                    : <span>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ))}

    {!visibles.length && <p className="board-empty">{t("Ningún jugador pasa esos filtros. Baja el mínimo de minutos o quita el tope de edad.")}</p>}
  </section>;
}
