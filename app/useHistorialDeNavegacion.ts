import { useEffect, useRef, useState } from "react";

/** Una entrada del historial: en qué página y con qué jugador. */
type Entrada = { fos: 1; idx: number; pagina: number; jugador: string };

/**
 * Atrás y adelante de verdad dentro de la plataforma.
 *
 * Las pestañas y el jugador eran estado de la página: el navegador no sabía
 * nada, y su "atrás" salía del sitio y se perdía todo lo cargado. Ahora cada
 * cambio de página o de jugador deja una entrada en el historial (sin cambiar
 * la dirección), y volver a ella devuelve esa página y ese jugador. Los
 * botones de la barra usan el mismo historial, así que dan lo mismo.
 *
 * `idx` cuenta la posición dentro de la plataforma: con él se sabe si hay
 * algo detrás (sin salir del sitio) o delante.
 *
 * Cada entrada conserva lo que Next.js guarda en ella (`__NA` y su árbol).
 * Sin eso, al volver atrás Next.js no reconoce la entrada y RECARGA la
 * página: justo lo que se quería evitar. Por eso se escribe siempre encima
 * de lo que ya hay, nunca en limpio.
 */
export function useHistorialDeNavegacion(pagina: number, jugador: string, aplicar: (pagina: number, jugador: string) => void) {
  const [posicion, setPosicion] = useState({ idx: 0, max: 0 });
  const aplicarActual = useRef(aplicar);
  useEffect(() => { aplicarActual.current = aplicar; });

  // Cada cambio, una entrada. Si el cambio llega de volver atrás, el
  // historial ya está en esa entrada y no se apila otra.
  useEffect(() => {
    const actual = window.history.state as Partial<Entrada> | null;
    if (actual?.fos && actual.pagina === pagina && actual.jugador === jugador) return;
    const deNext = (window.history.state ?? {}) as Record<string, unknown>;
    if (!actual?.fos) {
      window.history.replaceState({ ...deNext, fos: 1, idx: 0, pagina, jugador } satisfies Entrada, "");
      setPosicion({ idx: 0, max: 0 });
      return;
    }
    const idx = (actual.idx ?? 0) + 1;
    window.history.pushState({ ...deNext, fos: 1, idx, pagina, jugador } satisfies Entrada, "");
    setPosicion({ idx, max: idx });
  }, [pagina, jugador]);

  useEffect(() => {
    const alVolver = (evento: PopStateEvent) => {
      const estado = evento.state as Partial<Entrada> | null;
      if (!estado?.fos) return;
      const idx = estado.idx ?? 0;
      setPosicion((antes) => ({ idx, max: Math.max(antes.max, idx) }));
      aplicarActual.current(estado.pagina ?? 1, estado.jugador ?? "");
    };
    window.addEventListener("popstate", alVolver);
    return () => window.removeEventListener("popstate", alVolver);
  }, []);

  return {
    puedeVolver: posicion.idx > 0,
    puedeAvanzar: posicion.idx < posicion.max,
    volver: () => window.history.back(),
    avanzar: () => window.history.forward(),
  };
}
