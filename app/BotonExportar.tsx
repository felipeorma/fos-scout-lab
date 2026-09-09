"use client";

import { useState } from "react";
import { aCsv, nombreDeArchivo, type CeldaCsv } from "@/lib/exportar";
import { t, tf } from "@/lib/i18n";

/**
 * Bajarse la lista que hay en pantalla.
 *
 * El ranking y el buscador entre ligas terminaban ahí: para llevar una lista a
 * una reunión había que copiarla a mano de la pantalla, y encima recortada,
 * porque las dos muestran solo las cuarenta primeras. Lo que baja este botón
 * son TODAS las filas que pasan los filtros.
 *
 * Las filas se piden con una función y no como array porque armarlas cuesta —
 * son miles— y no tiene sentido pagarlo en cada render por un botón que casi
 * nunca se pulsa.
 */
export function BotonExportar({ nombre, columnas, filas, cuantas, deshabilitado }: {
  /** Las piezas del nombre del archivo: qué es, de qué puesto, de qué liga. */
  nombre: Array<string | number | null | undefined>;
  columnas: string[];
  filas: () => CeldaCsv[][];
  /** Cuántas van a bajar, para decirlo antes de pulsar. */
  cuantas: number;
  deshabilitado?: boolean;
}) {
  const [bajando, setBajando] = useState(false);

  function exportar() {
    if (bajando || !cuantas) return;
    setBajando(true);
    try {
      const csv = aCsv(columnas, filas());
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreDeArchivo(nombre);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      /* El navegador necesita el blob vivo hasta que arranca la descarga;
         revocarlo en la misma vuelta la cancela en Safari. */
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setBajando(false);
    }
  }

  return <button
    type="button"
    className="boton-exportar"
    disabled={deshabilitado || !cuantas || bajando}
    onClick={exportar}
    title={cuantas ? tf("Bajar las {n} filas a CSV, no solo las que se ven", { n: cuantas }) : t("No hay nada que exportar")}
  >
    <span aria-hidden="true">⇩</span>
    {cuantas ? tf("Exportar {n}", { n: cuantas }) : t("Exportar")}
  </button>;
}
