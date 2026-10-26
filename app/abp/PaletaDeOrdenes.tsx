"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";

/** Una orden de la paleta: lo que se lee, de qué grupo es, su atajo y lo que hace. */
export type Orden = { id: string; nombre: string; grupo: string; atajo?: string; hacer: () => void };

/** Sin tildes ni mayúsculas, para que «presion» encuentre «Presión». */
const plano = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Ctrl+K: cualquier herramienta o acción del estudio, escribiendo. Cada
 * palabra que se escribe tiene que estar en el nombre o en el grupo; las
 * flechas eligen e Intro la hace.
 */
export function PaletaDeOrdenes({ ordenes, onCerrar }: { ordenes: Orden[]; onCerrar: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  const [elegida, setElegida] = useState(0);
  const campoRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const encontradas = useMemo(() => {
    const palabras = plano(busqueda).split(/\s+/).filter(Boolean);
    return ordenes.filter((o) => palabras.every((p) => plano(`${o.nombre} ${o.grupo}`).includes(p))).slice(0, 40);
  }, [busqueda, ordenes]);

  useEffect(() => { campoRef.current?.focus(); }, []);
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [elegida]);

  function hacer(orden: Orden | undefined) {
    if (!orden) return;
    onCerrar();
    orden.hacer();
  }

  return <div className="abp-paleta-fondo" onPointerDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
    <div className="abp-paleta" role="dialog" aria-label={t("Buscar una herramienta o una acción")}>
      <input ref={campoRef} value={busqueda} placeholder={t("Busca una herramienta o una acción…")} aria-label={t("Buscar una herramienta o una acción")}
        role="combobox" aria-expanded="true" aria-controls="abp-paleta-lista" aria-activedescendant={encontradas[elegida] ? `abp-orden-${encontradas[elegida].id}` : undefined}
        onChange={(e) => { setBusqueda(e.target.value); setElegida(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setElegida((k) => Math.min(encontradas.length - 1, k + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setElegida((k) => Math.max(0, k - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); hacer(encontradas[elegida]); }
          else if (e.key === "Escape") { e.preventDefault(); onCerrar(); }
        }} />
      <ul id="abp-paleta-lista" ref={listaRef} role="listbox">
        {encontradas.map((o, k) => <li key={o.id} id={`abp-orden-${o.id}`} role="option" aria-selected={k === elegida}
          onPointerEnter={() => setElegida(k)} onClick={() => hacer(o)}>
          <span>{o.nombre}</span><small>{o.grupo}</small>{o.atajo && <kbd>{o.atajo}</kbd>}
        </li>)}
        {!encontradas.length && <li className="abp-paleta-nada">{t("Nada con ese nombre.")}</li>}
      </ul>
    </div>
  </div>;
}
