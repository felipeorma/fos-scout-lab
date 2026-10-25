/// <reference lib="webworker" />
/**
 * El cruce de bases, fuera del hilo de la pantalla. Con las trece ligas tarda
 * unos tres segundos y medio, y en el hilo principal la app se quedaba
 * congelada mientras tanto (ver lib/cruceEnSegundoPlano.ts).
 */
import { aggregateDatasets, temporadasDeFila, type SourceDataset } from "./scouting.ts";
import { setActiveLang, type Lang } from "./i18n.ts";

type Pedido = { id: number; datasets: SourceDataset[]; lang: Lang };

self.onmessage = (evento: MessageEvent<Pedido>) => {
  const { id, datasets, lang } = evento.data;
  try {
    setActiveLang(lang);
    const resultado = aggregateDatasets(datasets);
    // Las temporadas de cada fila viven en un WeakMap: no viajan con las filas.
    const temporadas = resultado.rows.map((fila) => temporadasDeFila(fila));
    self.postMessage({ id, resultado, temporadas });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
