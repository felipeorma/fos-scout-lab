import { numberLocale, tf } from "./i18n.ts";

/**
 * La línea que dice de qué datos sale una hoja y cuándo.
 *
 * Un PDF que circula por el club se lee semanas después: sin fecha, nadie
 * sabe si los números son de antes o de después del último partido, ni de
 * qué base salieron. Va al pie de cada hoja.
 */
export function lineaDeDatos({ descripcion, cargadaEl, generadoEl }: { descripcion: string; cargadaEl: number | null; generadoEl: number | null }) {
  const dia = (instante: number) => new Intl.DateTimeFormat(numberLocale(), { day: "numeric", month: "short", year: "numeric" }).format(instante);
  const hora = (instante: number) => new Intl.DateTimeFormat(numberLocale(), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instante);
  const partes = [
    descripcion ? tf("Datos: {base}", { base: descripcion }) : "",
    cargadaEl ? tf("cargados el {fecha}", { fecha: dia(cargadaEl) }) : "",
    // Solo al imprimir: en pantalla no hay "cuándo se generó".
    generadoEl ? tf("generado el {fecha}, {hora}", { fecha: dia(generadoEl), hora: hora(generadoEl) }) : "",
  ].filter(Boolean);
  return partes.join(" · ");
}
