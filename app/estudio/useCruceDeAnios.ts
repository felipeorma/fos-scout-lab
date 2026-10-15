import { useEffect, useState } from "react";
import { cruzarEnSegundoPlano } from "@/lib/cruceEnSegundoPlano";
import type { DataRow, SourceDataset } from "@/lib/scouting";

/** Cuántos cruces por temporada se recuerdan: los de los últimos jugadores vistos. */
const CRUCES_RECORDADOS = 6;

/**
 * El cruce de las bases de unos años (`clave`, "2026,2025"), hecho en el
 * worker. Mientras llega devuelve null y la ficha usa la fila de la base
 * entera; al volver a un jugador con los mismos años sale de lo recordado.
 * Se olvida todo cuando cambian las bases encendidas.
 */
export function useCruceDeAnios(basesActivas: SourceDataset[], clave: string): DataRow[] | null {
  const [hechos, setHechos] = useState<{ fuente: SourceDataset[]; filas: Map<string, DataRow[] | null> }>(() => ({ fuente: basesActivas, filas: new Map() }));
  const vigentes = hechos.fuente === basesActivas ? hechos.filas : null;
  const pendiente = Boolean(clave) && !vigentes?.has(clave);
  useEffect(() => {
    if (!pendiente) return;
    const anios = clave.split(",").map(Number);
    const bases = basesActivas.filter((dataset) => anios.includes(dataset.season));
    let vivo = true;
    const guardar = (filas: DataRow[] | null) => {
      if (!vivo) return;
      setHechos((antes) => {
        const filasPrevias = antes.fuente === basesActivas ? [...antes.filas].slice(-(CRUCES_RECORDADOS - 1)) : [];
        return { fuente: basesActivas, filas: new Map([...filasPrevias, [clave, filas]]) };
      });
    };
    (bases.length ? cruzarEnSegundoPlano(bases).then((resultado) => resultado.rows) : Promise.resolve(null))
      .then(guardar, () => guardar(null));
    return () => { vivo = false; };
  }, [pendiente, clave, basesActivas]);
  return clave ? vigentes?.get(clave) ?? null : null;
}
