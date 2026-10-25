import { createContext } from "react";

/**
 * Medir las hojas como se van a imprimir.
 *
 * Antes de abrir la impresión, cada hoja se mide con el diseño de pantalla
 * para encogerla si no cabe en Legal. Pero lo que la impresión oculta —barras
 * de filtros, selectores de Contexto y Carreras, "Cómo se calcula"— seguía a la
 * vista durante la medida: la hoja se encogía por contenido que el PDF no
 * lleva, y Contexto salía al 55 % por culpa de sus propios controles.
 *
 * En vez de mantener una segunda lista de lo que se oculta (que tarde o
 * temprano se separaría de la primera), se lee del CSS: toda regla con
 * `display: none` dentro de `@media print` se aplica también, mientras dura la
 * medida, a lo que hay dentro de las hojas.
 */
export function selectoresOcultosAlImprimir(hojas: Iterable<CSSStyleSheet>): string[] {
  const salida: string[] = [];
  const recorrer = (reglas: CSSRuleList, enImpresion: boolean) => {
    for (const regla of Array.from(reglas)) {
      if (typeof CSSMediaRule !== "undefined" && regla instanceof CSSMediaRule) {
        recorrer(regla.cssRules, enImpresion || /\bprint\b/i.test(regla.media.mediaText));
      } else if (enImpresion && typeof CSSStyleRule !== "undefined" && regla instanceof CSSStyleRule && regla.style.display === "none") {
        salida.push(regla.selectorText);
      }
    }
  };
  for (const hoja of hojas) {
    let reglas: CSSRuleList;
    // Las hojas de otro origen (Google Fonts) no dejan leer sus reglas.
    try { reglas = hoja.cssRules; } catch { continue; }
    recorrer(reglas, false);
  }
  return salida;
}

/** Aplica lo que oculta la impresión a la medida en pantalla. Devuelve cómo deshacerlo. */
export function ocultarComoAlImprimir(): () => void {
  const selectores = selectoresOcultosAlImprimir(Array.from(document.styleSheets));
  if (!selectores.length) return () => {};
  const estilo = document.createElement("style");
  estilo.id = "fos-medida-como-impresion";
  // `:is()` perdona: un selector que no valga dentro (un pseudoelemento) se
  // ignora sin tumbar la regla entera.
  estilo.textContent = `body.print-layout-check .legal-page-shell :is(${selectores.join(", ")}) { display: none !important; }`;
  document.head.appendChild(estilo);
  return () => estilo.remove();
}

/** Cuándo se pulsó Imprimir, para el pie de cada hoja; null mientras no se imprime. */
export const MomentoDeImpresion = createContext<number | null>(null);
