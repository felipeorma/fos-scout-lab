import { aggregateDatasets, registrarTemporadas, type AggregationResult, type SourceDataset, type TemporadaDeJugador } from "./scouting.ts";
import { activeLang } from "./i18n.ts";

/**
 * El cruce de bases en un Web Worker.
 *
 * Cruzar las trece ligas tarda unos tres segundos y medio, y rehacerlo para
 * una temporada en la ficha, uno o dos. En el hilo principal la pantalla se
 * congelaba todo ese rato: no se podía ni cerrar un diálogo. Aquí corre
 * aparte y la pantalla sigue viva. Si el navegador no puede crear el worker,
 * se cruza en el hilo principal como antes.
 */

type Respuesta = { id: number; resultado?: AggregationResult; temporadas?: TemporadaDeJugador[][]; error?: string };
type Pendiente = { resolver: (resultado: AggregationResult) => void; rechazar: (error: Error) => void; datasets: SourceDataset[] };

let trabajador: Worker | null = null;
let roto = false;
let siguiente = 0;
const pendientes = new Map<number, Pendiente>();

function obtener(): Worker | null {
  if (roto || typeof Worker === "undefined") return null;
  if (trabajador) return trabajador;
  try {
    // Clásico, sin `type: "module"`: el arranque que genera Turbopack usa
    // importScripts, que un worker de módulo no admite.
    trabajador = new Worker(new URL("./cruce.worker.ts", import.meta.url));
  } catch {
    roto = true;
    return null;
  }
  trabajador.onmessage = (evento: MessageEvent<Respuesta>) => {
    const { id, resultado, temporadas, error } = evento.data;
    const pendiente = pendientes.get(id);
    if (!pendiente) return;
    pendientes.delete(id);
    if (error || !resultado) { pendiente.rechazar(new Error(error ?? "cruce vacío")); return; }
    registrarTemporadas(resultado.rows, temporadas ?? []);
    pendiente.resolver(resultado);
  };
  // Si el worker no arranca (o se cae), lo pendiente se cruza aquí y no se
  // vuelve a intentar: mejor lento que colgado.
  trabajador.onerror = () => {
    roto = true;
    trabajador?.terminate();
    trabajador = null;
    for (const [id, pendiente] of pendientes) {
      pendientes.delete(id);
      try { pendiente.resolver(aggregateDatasets(pendiente.datasets)); } catch (error) { pendiente.rechazar(error as Error); }
    }
  };
  return trabajador;
}

export function cruzarEnSegundoPlano(datasets: SourceDataset[]): Promise<AggregationResult> {
  const worker = obtener();
  if (!worker) return Promise.resolve().then(() => aggregateDatasets(datasets));
  return new Promise((resolver, rechazar) => {
    const id = ++siguiente;
    pendientes.set(id, { resolver, rechazar, datasets });
    try {
      worker.postMessage({ id, datasets, lang: activeLang() });
    } catch {
      // Algo que no se puede copiar al worker: se cruza aquí.
      pendientes.delete(id);
      try { resolver(aggregateDatasets(datasets)); } catch (error) { rechazar(error as Error); }
    }
  });
}
