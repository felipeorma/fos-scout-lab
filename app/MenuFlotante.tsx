"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Un menú que sale del botón que lo abre.
 *
 * La barra superior tenía ocho grupos de controles en una sola fila: marca,
 * menú, espacios, un asistente de tres pasos, dos interruptores, una píldora
 * informativa y dos botones. Todo al mismo peso visual y siempre presente, de
 * modo que lo que se usa cada día —imprimir— pesaba lo mismo que lo que se
 * toca una vez al mes —cambiar el idioma—. Esta pieza existe para poder
 * guardar lo segundo sin esconderlo.
 *
 * Dos detalles que no son adorno:
 *
 * - Se abre DESDE el botón, no desde el centro de la pantalla. El
 *   `transform-origin` se ancla al disparador, así que el panel crece del
 *   sitio que se acaba de pulsar y la relación entre botón y contenido se ve
 *   sin pensarla. Y se cierra por el mismo camino: si algo aparece de un
 *   lado, se espera que vuelva por ahí.
 * - Cierra con Escape y pulsando fuera, y devuelve el foco al botón. Un menú
 *   que atrapa el foco es un menú del que no se sabe salir.
 */
export function MenuFlotante({ etiqueta, icono, children, alineado = "derecha", className = "" }: {
  /** Para lectores de pantalla; también es el `title` del botón. */
  etiqueta: string;
  /** Lo que se ve en el botón cerrado. */
  icono: ReactNode;
  children: ReactNode;
  /** De qué lado se alinea el panel con el botón. */
  alineado?: "izquierda" | "derecha";
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (evento: MouseEvent) => {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      setAbierto(false);
      disparador.current?.focus();
    };
    // En captura: un clic en un control de dentro cierra el menú por su cuenta,
    // y si se escuchara en burbuja se cerraría antes de que el control actúe.
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return <div ref={contenedor} className={`menu-flotante ${alineado} ${className}`.trim()}>
    <button
      ref={disparador}
      type="button"
      className={abierto ? "menu-flotante-boton abierto" : "menu-flotante-boton"}
      aria-haspopup="menu"
      aria-expanded={abierto}
      aria-controls={abierto ? id : undefined}
      aria-label={etiqueta}
      title={etiqueta}
      onClick={() => setAbierto((estaba) => !estaba)}
    >
      {icono}
    </button>
    {abierto && <div id={id} role="menu" className="menu-flotante-panel" aria-label={etiqueta}>
      {children}
    </div>}
  </div>;
}

/** Una fila del menú: acción a la izquierda, estado o control a la derecha. */
export function FilaDeMenu({ children, onClick, activo, peligro }: {
  children: ReactNode;
  onClick?: () => void;
  /** Marca la opción vigente, como el tick de iOS. */
  activo?: boolean;
  /** Para lo que destruye algo; se pinta con el color de aviso. */
  peligro?: boolean;
}) {
  const clases = ["menu-fila", activo ? "activa" : "", peligro ? "peligro" : ""].filter(Boolean).join(" ");
  if (!onClick) return <div className={clases} role="presentation">{children}</div>;
  return <button type="button" role="menuitem" className={clases} onClick={onClick}>{children}</button>;
}

/** Separa bloques dentro del menú, como los grupos de Ajustes. */
export function GrupoDeMenu({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return <div className="menu-grupo" role="group" aria-label={titulo}>
    {titulo && <span className="menu-grupo-titulo">{titulo}</span>}
    {children}
  </div>;
}
