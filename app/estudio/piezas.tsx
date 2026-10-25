import { ChevronRight } from "../Icons";
import { MenuDesplegable } from "../MenuDesplegable";
import { LogoLiga } from "../Escudo";
import { t } from "@/lib/i18n";
import type { ApiCompetition } from "@/lib/remoteData";

/*
 * Piezas pequeñas de la pantalla principal (ScoutStudio), sacadas aparte
 * para que el componente no pase de tres mil líneas.
 */

/**
 * Una fila del panel de secciones, al modo de las listas de Ajustes de iOS.
 *
 * Antes cada destino era un botón de solo texto —título en negrita y una
 * línea pequeña debajo— y todos se parecían: había que leerlos para
 * distinguirlos. La baldosa con el icono deja reconocer la fila por su forma,
 * y el galón de la derecha dice sin palabras que pulsarla lleva a otro sitio.
 */
export function FilaSeccion({ activa, onClick, icono, titulo, detalle, api }: {
  activa: boolean;
  onClick: () => void;
  icono: React.ReactNode;
  titulo: string;
  detalle?: string;
  /** Pide datos al servidor local: se avisa porque sin él no carga. */
  api?: boolean;
}) {
  return <button type="button" className={activa ? "seccion-fila activa" : "seccion-fila"}
    aria-current={activa ? "page" : undefined} onClick={onClick}>
    <span className="seccion-icono" aria-hidden="true">{icono}</span>
    <span className="seccion-texto"><b>{titulo}</b>{detalle && <small>{detalle}</small>}</span>
    {api && <i className="seccion-api">API</i>}
    <ChevronRight size={14} className="seccion-chevron" />
  </button>;
}

/**
 * Las competiciones agrupadas por liga, para el desplegable de la API.
 *
 * La suscripción pasó de tres competiciones a dieciséis (setenta y una
 * entradas contando temporadas), y la lista plana en el orden que devuelve la
 * API dejó de servir: obligaba a recorrer setenta líneas y ponía la temporada
 * más antigua arriba, cuando la que se quiere casi siempre es la última.
 *
 * Se conserva el índice original de cada entrada porque es lo que guarda la
 * selección; aquí solo cambia el orden en que se dibujan.
 */
export function competicionesAgrupadas(lista: ApiCompetition[]) {
  const grupos = new Map<string, Array<{ competition: ApiCompetition; indice: number }>>();
  lista.forEach((competition, indice) => {
    const clave = competition.country ? `${competition.name} · ${competition.country}` : competition.name;
    grupos.set(clave, [...(grupos.get(clave) ?? []), { competition, indice }]);
  });
  return [...grupos.entries()]
    .map(([nombre, entradas]) => ({
      nombre,
      // Temporada más reciente primero: es la que se busca a diario.
      entradas: [...entradas].sort((a, b) => String(b.competition.season).localeCompare(String(a.competition.season), "en", { numeric: true })),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** El menú de competiciones del diálogo: cada liga con su logo y, debajo, sus temporadas. */
export function MenuDeCompeticiones({ lista, elegida, onElegir }: { lista: ApiCompetition[]; elegida: string; onElegir: (indice: string) => void }) {
  const grupos = competicionesAgrupadas(lista);
  const ligaDe = new Map(grupos.map((grupo) => [grupo.nombre, grupo.entradas[0]?.competition.name ?? ""]));
  const actual = elegida ? lista[Number(elegida)] : undefined;
  return <MenuDesplegable variante="campo" etiqueta={t("Competición")} marcador={`${t("Elegir competición")}…`}
    valor={actual ? `${actual.name} · ${actual.season}` : ""}
    icono={actual ? <LogoLiga liga={actual.name} tamano={16} /> : null}
    opciones={grupos.flatMap((grupo) => grupo.entradas.map(({ competition, indice }) => ({
      valor: String(indice), texto: String(competition.season), grupo: grupo.nombre,
    })))}
    iconoDeGrupo={(grupo) => <LogoLiga liga={ligaDe.get(grupo) ?? ""} tamano={20} hueco />}
    elegida={elegida} onElegir={onElegir} />;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="field-label">{children}</span>;
}

// Texto del informe editable con clic directo sobre la vista previa.
// No controlado a propósito: el estado se confirma al salir del campo (blur)
// para que el cursor no salte mientras se escribe.
export function InlineText({ value, fallback, onCommit, multiline = false, editKey }: { value: string; fallback: string; onCommit: (next: string) => void; multiline?: boolean; editKey: string }) {
  return <span
    key={editKey}
    className="inline-editable"
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-multiline={multiline}
    spellCheck={false}
    title={t("Haz clic para editar")}
    onKeyDown={(event) => {
      if (!multiline && event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.currentTarget.textContent = value || fallback; event.currentTarget.blur(); }
    }}
    onBlur={(event) => {
      const next = (event.currentTarget.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
      onCommit(next === fallback.trim() ? "" : next);
    }}
  >{value || fallback}</span>;
}

export function ReportImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  // Los recursos se cargan desde Transfermarkt o desde archivos locales elegidos por el usuario.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
