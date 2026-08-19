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

const PERFILES: Array<{ id: string; etiqueta: string }> = [
  { id: "GK", etiqueta: "Porteros" }, { id: "CB", etiqueta: "Centrales" }, { id: "FB", etiqueta: "Laterales" },
  { id: "DMF", etiqueta: "Pivotes" }, { id: "B2B", etiqueta: "Interiores" }, { id: "AM", etiqueta: "Mediapuntas" },
  { id: "WING", etiqueta: "Extremos" }, { id: "DWING", etiqueta: "Extremos directos" }, { id: "CF", etiqueta: "Delanteros" },
];

type Ficha = {
  indice: number;
  jugador: string;
  equipo: string;
  edad: number;
  minutos: number;
  perfil: string;
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
    if (perfil !== "TODOS") lista = lista.filter((f) => f.perfil === perfil);
    if (edadMax > 0) lista = lista.filter((f) => Number.isFinite(f.edad) && f.edad <= edadMax);
    if (soloJoven) lista = lista.filter((f) => Number.isFinite(f.edad) && f.edad <= 23);
    return [...lista].sort((a, b) => b.puntuacion - a.puntuacion);
  }, [fichas, perfil, edadMax, soloJoven]);

  const porPerfil = useMemo(() => {
    const mapa = new Map<string, Ficha[]>();
    for (const ficha of visibles) mapa.set(ficha.perfil, [...(mapa.get(ficha.perfil) ?? []), ficha]);
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
          {PERFILES.map((item) => <option key={item.id} value={item.id}>{t(item.etiqueta)}</option>)}
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

    {[...porPerfil.entries()].sort((a, b) => b[1].length - a[1].length).map(([id, lista]) => (
      <div key={id} className="board-group">
        <h3>{t(PERFILES.find((p) => p.id === id)?.etiqueta ?? id)} <i>{lista.length}</i></h3>
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
