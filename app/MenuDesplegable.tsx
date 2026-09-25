"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "./Icons";
import { LogoLiga } from "./Escudo";
import { t } from "@/lib/i18n";

/**
 * Un menú con imágenes: el select nativo no admite logos dentro de sus
 * opciones, y en un menú de ligas o de equipos el logo es lo que se busca
 * con la vista antes de leer.
 *
 * Por fuera es la misma ficha que Desplegable ("chip") o un campo de
 * formulario ("campo"). Por dentro, un listbox: flechas, Inicio/Fin, Enter,
 * Escape y la primera letra para saltar; clic fuera lo cierra.
 */

export type OpcionDeMenu = {
  valor: string;
  texto: string;
  /** Las opciones con el mismo grupo van juntas bajo su cabecera. */
  grupo?: string;
  icono?: ReactNode;
};

export function MenuDesplegable({
  etiqueta, valor, icono, activo = false, opciones, elegida, onElegir, iconoDeGrupo,
  variante = "chip", ariaLabel, marcador, apagado = false,
}: {
  /** El nombre del menú ("Liga"); en la ficha se lee delante del valor. */
  etiqueta: string;
  /** Lo que se muestra como elegido. */
  valor: string;
  icono?: ReactNode;
  activo?: boolean;
  opciones: OpcionDeMenu[];
  elegida: string;
  onElegir: (valor: string) => void;
  iconoDeGrupo?: (grupo: string) => ReactNode;
  variante?: "chip" | "campo";
  ariaLabel?: string;
  /** En la variante campo, el texto cuando no hay nada elegido. */
  marcador?: string;
  apagado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const [alDerecha, setAlDerecha] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const id = useId();

  const abrir = () => {
    const i = opciones.findIndex((opcion) => opcion.valor === elegida);
    setActiva(i >= 0 ? i : 0);
    setAlDerecha(false);
    recienAbierto.current = true;
    setAbierto(true);
  };
  const cerrar = (devolverFoco = true) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  };
  const elegir = (i: number) => {
    const opcion = opciones[i];
    if (opcion) onElegir(opcion.valor);
    cerrar();
  };

  // Abierto: el foco pasa a la lista, y si se sale por la derecha se alinea al otro borde.
  useLayoutEffect(() => {
    if (!abierto || !lista.current) return;
    lista.current.focus({ preventScroll: true });
    const caja = lista.current.getBoundingClientRect();
    if (caja.right > window.innerWidth - 8) setAlDerecha(true);
  }, [abierto]);

  // Al abrir, la elegida queda en medio de la lista; al moverse con las flechas, solo lo justo.
  const recienAbierto = useRef(false);
  useEffect(() => {
    if (!abierto) return;
    lista.current?.querySelector<HTMLElement>(`[data-i="${activa}"]`)?.scrollIntoView({ block: recienAbierto.current ? "center" : "nearest" });
    recienAbierto.current = false;
  }, [abierto, activa]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (evento: PointerEvent) => {
      if (!raiz.current?.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  const teclaEnBoton = (evento: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(evento.key)) {
      evento.preventDefault();
      abrir();
    }
  };

  const teclaEnLista = (evento: KeyboardEvent) => {
    const ultima = opciones.length - 1;
    const mover = (i: number) => { evento.preventDefault(); setActiva(Math.max(0, Math.min(ultima, i))); };
    switch (evento.key) {
      case "ArrowDown": return mover(activa + 1);
      case "ArrowUp": return mover(activa - 1);
      case "Home": return mover(0);
      case "End": return mover(ultima);
      case "PageDown": return mover(activa + 8);
      case "PageUp": return mover(activa - 8);
      case "Enter": case " ": evento.preventDefault(); return elegir(activa);
      case "Escape": evento.preventDefault(); return cerrar();
      case "Tab": return cerrar(false);
    }
    // La primera letra salta a la siguiente opción que empieza por ella.
    if (evento.key.length === 1 && /\S/.test(evento.key)) {
      const letra = evento.key.toLowerCase();
      for (let paso = 1; paso <= opciones.length; paso += 1) {
        const i = (activa + paso) % opciones.length;
        if (opciones[i].texto.toLowerCase().startsWith(letra)) { setActiva(i); break; }
      }
    }
  };

  const fila = (opcion: OpcionDeMenu, i: number) => {
    const esElegida = opcion.valor === elegida;
    return <div key={opcion.valor} id={`${id}-${i}`} data-i={i} role="option" aria-selected={esElegida}
      className={["menu-opcion", i === activa ? "activa" : "", esElegida ? "elegida" : ""].filter(Boolean).join(" ")}
      onPointerMove={() => { if (i !== activa) setActiva(i); }}
      onClick={() => elegir(i)}>
      {opcion.icono}<span>{opcion.texto}</span>
    </div>;
  };
  // Cada grupo en su caja: así la cabecera fija de una liga la empuja fuera
  // la de la siguiente, en vez de quedarse las dos una encima de otra.
  const filas: ReactNode[] = [];
  let caja: { grupo: string; filas: ReactNode[] } | null = null;
  opciones.forEach((opcion, i) => {
    if (!opcion.grupo) { caja = null; filas.push(fila(opcion, i)); return; }
    if (!caja || caja.grupo !== opcion.grupo) {
      caja = { grupo: opcion.grupo, filas: [] };
      const cabecera = `${id}-g-${filas.length}`;
      filas.push(<div key={`g-${opcion.grupo}`} role="group" aria-labelledby={cabecera} className="menu-caja">
        <div id={cabecera} className="menu-grupo">{iconoDeGrupo?.(opcion.grupo)}<span>{opcion.grupo}</span></div>
        {caja.filas}
      </div>);
    }
    caja.filas.push(fila(opcion, i));
  });

  // Vacío es no tener ninguna de las opciones elegida; "" puede ser una ("Todos").
  const vacio = variante === "campo" && !opciones.some((opcion) => opcion.valor === elegida);
  return <div ref={raiz} className={variante === "campo" ? "menu-desplegable menu-campo-caja" : "menu-desplegable"}>
    <button ref={boton} type="button" disabled={apagado}
      className={variante === "campo"
        ? ["menu-campo", vacio ? "vacio" : ""].filter(Boolean).join(" ")
        : ["filtro-chip", "menu-chip", activo ? "activo" : ""].filter(Boolean).join(" ")}
      aria-haspopup="listbox" aria-expanded={abierto} aria-controls={abierto ? `${id}-lista` : undefined}
      aria-label={`${ariaLabel ?? etiqueta}: ${vacio ? marcador ?? "" : valor}`}
      onClick={() => (abierto ? cerrar() : abrir())} onKeyDown={teclaEnBoton}>
      {variante === "chip" && <span aria-hidden="true">{etiqueta}</span>}
      {icono}
      <b aria-hidden="true">{vacio ? marcador : valor}</b>
      <ChevronDown size={12} />
    </button>
    {abierto && <div ref={lista} id={`${id}-lista`} role="listbox" tabIndex={-1} aria-label={ariaLabel ?? etiqueta}
      aria-activedescendant={`${id}-${activa}`}
      className={alDerecha ? "menu-lista al-derecha" : "menu-lista"} onKeyDown={teclaEnLista}>
      {filas}
    </div>}
  </div>;
}

/** El menú de ligas: "Todas" y cada liga con su logo (las que no están en API-Football, con el hueco). */
export function MenuDeLigas({ ligas, elegida, onElegir, ariaLabel, variante = "chip" }: {
  ligas: string[];
  /** "TODAS" o el nombre de una liga. */
  elegida: string;
  onElegir: (liga: string) => void;
  ariaLabel?: string;
  variante?: "chip" | "campo";
}) {
  const todas = elegida === "TODAS";
  return <MenuDesplegable etiqueta={t("Liga")} ariaLabel={ariaLabel} variante={variante}
    valor={todas ? t("Todas") : elegida} activo={!todas}
    icono={todas ? null : <LogoLiga liga={elegida} tamano={variante === "campo" ? 16 : 14} />}
    opciones={[
      { valor: "TODAS", texto: t("Todas"), icono: <LogoLiga liga="" tamano={22} hueco /> },
      ...ligas.map((liga) => ({ valor: liga, texto: liga, icono: <LogoLiga liga={liga} tamano={22} hueco /> })),
    ]}
    elegida={elegida} onElegir={onElegir} />;
}
