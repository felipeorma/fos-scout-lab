"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Pencil } from "./Icons";
import { t } from "@/lib/i18n";
import { temporadaValida, type NombreDeBase } from "@/lib/nombresDeBase";

/**
 * El nombre de una base cargada desde un archivo (Wyscout), editable en su
 * sitio: se lee como texto y, al tocarlo, se abren dos campos —liga y
 * temporada— que se aplican a la base entera, no solo a ese rótulo. Por eso
 * no es un InlineText: lo que cambia es de dónde dice la app que viene el
 * dato, y se nota en la ficha, los filtros y el panel a la vez.
 *
 * Al imprimir solo queda el texto.
 */
export function EditorDeNombreDeBase({ actual, onGuardar, children, className = "" }: {
  actual: NombreDeBase;
  onGuardar: (nombre: NombreDeBase) => void;
  /** Cómo se lee cerrado. */
  children: ReactNode;
  className?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [liga, setLiga] = useState(actual.liga);
  const [temporada, setTemporada] = useState(actual.temporada);
  const primero = useRef<HTMLInputElement>(null);

  const abrir = () => { setLiga(actual.liga); setTemporada(actual.temporada); setAbierto(true); };
  useEffect(() => { if (abierto) primero.current?.select(); }, [abierto]);

  const temporadaBien = temporadaValida(temporada);
  const sePuede = liga.trim() !== "" && temporadaBien;
  const guardar = (evento?: FormEvent) => {
    evento?.preventDefault();
    if (!sePuede) return;
    setAbierto(false);
    if (liga.trim() !== actual.liga || temporada.trim() !== actual.temporada) onGuardar({ liga, temporada });
  };
  const tecla = (evento: KeyboardEvent) => { if (evento.key === "Escape") { evento.preventDefault(); setAbierto(false); } };

  if (!abierto) {
    return <button type="button" className={`nombre-base ${className}`.trim()} onClick={abrir}
      title={t("Escribir la liga y la temporada de esta base")}>
      {children}<Pencil size={12} className="nombre-base-lapiz" />
    </button>;
  }
  return <form className={`nombre-base-form ${className}`.trim()} onSubmit={guardar} onKeyDown={tecla}>
    <label><span>{t("Liga")}</span>
      <input ref={primero} value={liga} onChange={(evento) => setLiga(evento.target.value)} placeholder={t("Primera División")} />
    </label>
    <label className={temporadaBien ? "" : "con-error"}><span>{t("Temporada")}</span>
      <input value={temporada} onChange={(evento) => setTemporada(evento.target.value)} placeholder="2026 · 2025/2026" inputMode="numeric" />
    </label>
    <span className="nombre-base-acciones">
      <button type="submit" disabled={!sePuede}>{t("Guardar")}</button>
      <button type="button" onClick={() => setAbierto(false)}>{t("Cancelar")}</button>
    </span>
    {!temporadaBien && <small>{t("La temporada se escribe 2026 o 2025/2026.")}</small>}
  </form>;
}
