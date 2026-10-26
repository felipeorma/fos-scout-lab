"use client";

import { useEffect, useState } from "react";
import type { Jugada } from "@/lib/abp";
import { t, tf, type Lang } from "@/lib/i18n";
import {
  CLAVE_PLAN, agregarBloque, bloquesConSistema, cambiarBloque, inicios, minutosTotales, moverBloque, planValido, planVacio, quitarBloque,
  type PlanDeSesion,
} from "@/lib/planDeSesion";
import { ArrowDownToLine, MoveDown, MoveUp, Plus, Trash, X } from "../Icons";

/**
 * El plan de una sesión: los sistemas del estudio en el orden en que se
 * entrenan, con sus minutos y lo que hay que corregir en cada uno. Se guarda
 * en este navegador y sale en un PDF A4 claro, para imprimir y llevar al campo.
 */
export function PlanDeSesionPanel({ jugadas, miniaturas, idioma, nombre, acento, firma, foto, onCerrar }: {
  jugadas: Jugada[];
  miniaturas: Record<string, string>;
  idioma: Lang;
  /** El nombre de serie en el idioma de la pantalla. */
  nombre: (texto: string) => string;
  acento: string;
  firma: string;
  /** La foto de una fase de un sistema, en JPEG, para el PDF. */
  foto: (jugada: Jugada, indice: number) => string;
  onCerrar: () => void;
}) {
  const [plan, setPlan] = useState<PlanDeSesion>(planVacio);
  const [leido, setLeido] = useState(false);
  const [aviso, setAviso] = useState("");
  // La foto de los sistemas que aún no tienen miniatura (no se han abierto en esta sesión).
  const [fotos, setFotos] = useState<Record<string, string>>({});

  // Lo guardado se lee una vez al abrir; después, cada cambio se guarda.
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_PLAN);
      if (guardado) setPlan(planValido(JSON.parse(guardado))); // eslint-disable-line react-hooks/set-state-in-effect
    } catch { /* sin almacenamiento: el plan vive mientras esté abierto */ }
    setLeido(true);
  }, []);
  useEffect(() => {
    if (!leido) return;
    try { window.localStorage.setItem(CLAVE_PLAN, JSON.stringify(plan)); } catch { /* ídem */ }
  }, [plan, leido]);

  useEffect(() => {
    const faltan = [...new Set(plan.bloques.map((b) => b.jugadaId))].filter((id) => !miniaturas[id] && !fotos[id]);
    if (!faltan.length) return;
    const nuevas: Record<string, string> = {};
    for (const id of faltan) {
      const jugada = jugadas.find((j) => j.id === id);
      if (jugada) try { nuevas[id] = foto(jugada, 0); } catch { /* sin foto: se queda el hueco */ }
    }
    if (Object.keys(nuevas).length) setFotos((actuales) => ({ ...actuales, ...nuevas })); // eslint-disable-line react-hooks/set-state-in-effect
  }, [plan.bloques, jugadas, miniaturas, fotos, foto]);

  const vivos = bloquesConSistema(plan, jugadas);
  const total = minutosTotales(plan, jugadas);
  const empiezan = inicios(vivos.map((x) => x.bloque.minutos));
  const fecha = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(idioma === "en" ? "en-GB" : "es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  async function descargarPdf() {
    if (!vivos.length) return;
    setAviso(t("Preparando el PDF…"));
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const W = 210, H = 297, M = 14;
      const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const;
      const pie = (n: number) => {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 130);
        pdf.text(firma ? `${firma} · FOS Scout Lab` : "FOS Scout Lab", M, H - 8);
        pdf.text(String(n), W - M, H - 8, { align: "right" });
      };
      // La cabecera: qué sesión, cuándo, cuánto dura y para qué.
      pdf.setTextColor(...rgb(acento));
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.text(t("PLAN DE SESIÓN"), M, M + 3, { charSpace: 0.6 });
      pdf.setTextColor(20, 20, 24);
      pdf.setFontSize(19);
      pdf.text(plan.titulo.trim() || t("Sesión de entrenamiento"), M, M + 12);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(90, 90, 100);
      pdf.text(`${fecha(plan.fecha)} · ${tf("{n} min", { n: total })} · ${tf(vivos.length === 1 ? "{n} bloque" : "{n} bloques", { n: vivos.length })}`, M, M + 18.5);
      let y = M + 24;
      if (plan.objetivo.trim()) {
        pdf.setFontSize(10.5);
        pdf.setTextColor(20, 20, 24);
        const lineas = pdf.splitTextToSize(`${t("Objetivo")}: ${plan.objetivo.trim()}`, W - 2 * M) as string[];
        pdf.text(lineas, M, y + 2);
        y += lineas.length * 4.6 + 3;
      }
      pdf.setDrawColor(220, 220, 226);
      pdf.line(M, y, W - M, y);
      y += 6;
      let pagina = 1;
      const anchoFoto = 92, altoFoto = 60, altoBloque = altoFoto + 8;
      vivos.forEach(({ bloque, jugada }, k) => {
        if (y + altoBloque > H - M - 6) { pie(pagina); pdf.addPage(); pagina += 1; y = M; }
        // La foto: la primera fase, que es donde empieza el ejercicio.
        const imagen = foto(jugada, 0);
        const { width: iw, height: ih } = pdf.getImageProperties(imagen);
        const k2 = Math.min(anchoFoto / iw, altoFoto / ih);
        pdf.addImage(imagen, "JPEG", M + (anchoFoto - iw * k2) / 2, y + (altoFoto - ih * k2) / 2, iw * k2, ih * k2);
        const x = M + anchoFoto + 7, ancho = W - M - x;
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(...rgb(acento));
        pdf.text(`${String(k + 1).padStart(2, "0")} · ${tf("minuto {a} a {b}", { a: empiezan[k], b: empiezan[k] + bloque.minutos })}`, x, y + 4);
        pdf.setFontSize(13);
        pdf.setTextColor(20, 20, 24);
        const titulo = pdf.splitTextToSize(nombre(jugada.nombre), ancho) as string[];
        pdf.text(titulo.slice(0, 2), x, y + 10.5);
        let yy = y + 10.5 + Math.min(2, titulo.length) * 5.4;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.setTextColor(70, 70, 80);
        pdf.text(tf("{n} min", { n: bloque.minutos }), x, yy);
        yy += 5.5;
        // Lo que se anota en el bloque y, si no hay, la nota de su primera fase.
        const notas = bloque.notas.trim() || nombre(jugada.fases[0]?.nota ?? "").trim();
        const fases = jugada.fases.length > 1 ? jugada.fases.map((f, i) => `${i + 1}. ${nombre(f.nombre)}`).join("   ") : "";
        pdf.setTextColor(20, 20, 24);
        for (const texto of [notas, fases].filter(Boolean)) {
          const lineas = (pdf.splitTextToSize(texto, ancho) as string[]).slice(0, Math.max(1, Math.floor((y + altoFoto - yy) / 4.4)));
          pdf.text(lineas, x, yy);
          yy += lineas.length * 4.4 + 2;
          pdf.setTextColor(110, 110, 120);
        }
        y += altoBloque;
      });
      pie(pagina);
      const archivo = (plan.titulo.trim() || "plan-de-sesion").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "-").toLowerCase();
      pdf.save(`${archivo}-${plan.fecha}.pdf`);
      setAviso("");
    } catch {
      setAviso(t("No se pudo preparar el PDF. Prueba de nuevo."));
    }
  }

  return <section className="tactico-nuevo tactico-plan" aria-label={t("Plan de sesión")}>
    <header>
      <h3>{t("Plan de sesión")}<small>{tf("{n} min", { n: total })}</small></h3>
      <button type="button" className="menu-cerrar" aria-label={t("Cerrar")} onClick={onCerrar}><X size={15} /></button>
    </header>
    <div className="tactico-plan-cabecera">
      <label><span>{t("Título")}</span>
        <input value={plan.titulo} maxLength={80} placeholder={t("Sesión de entrenamiento")} onChange={(e) => setPlan((p) => ({ ...p, titulo: e.target.value }))} />
      </label>
      <label><span>{t("Fecha")}</span>
        <input type="date" value={plan.fecha} onChange={(e) => setPlan((p) => ({ ...p, fecha: e.target.value || p.fecha }))} />
      </label>
      <label className="ancho"><span>{t("Objetivo")}</span>
        <input value={plan.objetivo} maxLength={300} placeholder={t("Qué se quiere mejorar hoy")} onChange={(e) => setPlan((p) => ({ ...p, objetivo: e.target.value }))} />
      </label>
    </div>
    {!jugadas.length && <p className="tactico-aviso">{t("Crea antes algún sistema: cada bloque de la sesión es uno.")}</p>}
    <ol className="tactico-plan-bloques">
      {plan.bloques.map((b, k) => {
        const jugada = jugadas.find((j) => j.id === b.jugadaId);
        return <li key={b.id}>
          {/* Una foto del lienzo en data:, nada que optimizar con next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {miniaturas[b.jugadaId] || fotos[b.jugadaId] ? <img src={miniaturas[b.jugadaId] || fotos[b.jugadaId]} alt="" /> : <i className="tactico-plan-sin-foto" aria-hidden="true" />}
          <div className="tactico-plan-datos">
            <div className="tactico-plan-fila">
              <b>{String(k + 1).padStart(2, "0")}</b>
              <select value={b.jugadaId} aria-label={t("Sistema")} onChange={(e) => setPlan((p) => cambiarBloque(p, b.id, { jugadaId: e.target.value }))}>
                {!jugada && <option value={b.jugadaId}>{t("(sistema borrado)")}</option>}
                {jugadas.map((j) => <option key={j.id} value={j.id}>{nombre(j.nombre)}</option>)}
              </select>
              <label className="tactico-plan-minutos"><input type="number" min={1} max={180} value={b.minutos} aria-label={t("Minutos")}
                onChange={(e) => setPlan((p) => cambiarBloque(p, b.id, { minutos: Number(e.target.value) || 1 }))} /><span>{t("min")}</span></label>
              <span className="tactico-plan-botones">
                <button type="button" aria-label={t("Subir")} title={t("Subir")} disabled={k === 0} onClick={() => setPlan((p) => moverBloque(p, b.id, -1))}><MoveUp size={13} /></button>
                <button type="button" aria-label={t("Bajar")} title={t("Bajar")} disabled={k === plan.bloques.length - 1} onClick={() => setPlan((p) => moverBloque(p, b.id, 1))}><MoveDown size={13} /></button>
                <button type="button" className="peligro" aria-label={t("Quitar")} title={t("Quitar")} onClick={() => setPlan((p) => quitarBloque(p, b.id))}><Trash size={13} /></button>
              </span>
            </div>
            <textarea value={b.notas} maxLength={400} rows={2} placeholder={t("Consignas, reglas, series y descanso…")} aria-label={t("Notas del bloque")}
              onChange={(e) => setPlan((p) => cambiarBloque(p, b.id, { notas: e.target.value }))} />
          </div>
        </li>;
      })}
    </ol>
    <div className="tactico-plan-acciones">
      <button type="button" className="button secondary compact" disabled={!jugadas.length || plan.bloques.length >= 12} onClick={() => setPlan((p) => agregarBloque(p, jugadas))}><Plus size={14} />{t("Añadir bloque")}</button>
      <button type="button" className="button primary compact" disabled={!vivos.length} onClick={() => void descargarPdf()}><ArrowDownToLine size={14} />{t("Descargar PDF")}</button>
      {aviso && <span role="status">{aviso}</span>}
    </div>
  </section>;
}
