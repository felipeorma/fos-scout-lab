"use client";

import { useId, type ReactNode } from "react";
import { MATERIALES, PATRONES, type Equipacion, type Patron, type TipoMaterial } from "@/lib/abp";
import { ESPACIOS, PETOS, type Espacio } from "@/lib/entrenamiento";
import { t, tf } from "@/lib/i18n";
import { Interruptor } from "../Interruptor";

/** El dibujo de cada pieza en el selector: de frente, como se reconoce en el almacén. */
export function IconoDeMaterial({ tipo, color, size = 22 }: { tipo: TipoMaterial; color: string; size?: number }) {
  const borde = "rgba(0, 0, 0, 0.5)";
  const dibujos: Record<TipoMaterial, ReactNode> = {
    seta: <><ellipse cx="12" cy="16" rx="8.5" ry="2.6" fill={color} stroke={borde} /><path d="M5.6 15.4 Q12 6.5 18.4 15.4" fill={color} stroke={borde} /><ellipse cx="12" cy="11.4" rx="1.8" ry="0.8" fill="rgba(0,0,0,.35)" /></>,
    cono: <><path d="M10 4h4l4 14H6z" fill={color} stroke={borde} strokeLinejoin="round" /><path d="M8.4 11.5h7.2" stroke="#fff" strokeWidth="1.6" /><rect x="4" y="18" width="16" height="2.4" rx="0.6" fill={color} stroke={borde} /></>,
    pica: <><rect x="10.8" y="2.5" width="2.4" height="16" rx="1" fill={color} stroke={borde} /><path d="M11 6.5h2M11 10.5h2M11 14.5h2" stroke="rgba(0,0,0,.35)" /><ellipse cx="12" cy="19.6" rx="4.5" ry="1.6" fill="#555" stroke={borde} /></>,
    valla: <><path d="M5.5 19.5V8M18.5 19.5V8" stroke={color} strokeWidth="2.2" strokeLinecap="round" /><rect x="4" y="7" width="16" height="3" rx="1" fill={color} stroke={borde} /><path d="M3.5 19.5h4M16.5 19.5h4" stroke={color} strokeWidth="2" strokeLinecap="round" /></>,
    aro: <><ellipse cx="12" cy="13.5" rx="8.5" ry="4.2" fill="none" stroke={borde} strokeWidth="3.4" /><ellipse cx="12" cy="13.5" rx="8.5" ry="4.2" fill="none" stroke={color} strokeWidth="2.2" /></>,
    escalera: <><path d="M7 3v18M17 3v18" stroke={color} strokeWidth="2" strokeLinecap="round" /><path d="M7 6h10M7 10h10M7 14h10M7 18h10" stroke={color} strokeWidth="1.6" opacity="0.85" /></>,
    balon: <><circle cx="12" cy="12" r="8" fill={color} stroke={borde} /><path d="M12 8.2l3 2.2-1.1 3.5h-3.8L9 10.4z" fill="#222" /><path d="M12 8.2V4.4M15 10.4l3.5-1.2M13.9 13.9l2.1 3.2M10.1 13.9L8 17.1M9 10.4L5.5 9.2" stroke="#222" strokeWidth="0.9" /></>,
    maniqui: <><circle cx="12" cy="5" r="2.4" fill={color} stroke={borde} /><path d="M7.5 9.2h9l-1.4 10.3H8.9z" fill={color} stroke={borde} strokeLinejoin="round" /><path d="M12 19.5v1.8M8.5 21.3h7" stroke="#555" strokeWidth="1.4" strokeLinecap="round" /></>,
    miniporteria: <><path d="M4.5 19V9.5h15V19" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /><path d="M6.5 11.5h11M6.5 14.5h11M6.5 17.5h11M9 10v9M12 10v9M15 10v9" stroke={color} strokeWidth="0.6" opacity="0.55" /></>,
    porteria: <><path d="M2 19.5V6h20v13.5" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" /><path d="M3.5 9h17M3.5 12h17M3.5 15h17M3.5 18h17M6 7v12M10 7v12M14 7v12M18 7v12" stroke={color} strokeWidth="0.6" opacity="0.5" /></>,
  };
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">{dibujos[tipo]}</svg>;
}

/** La rejilla de piezas: la herramienta pone la elegida; con una pieza elegida, la cambia. */
export function SelectorDeMaterial({ valor, color, onCambio, nombre }: {
  valor: TipoMaterial;
  /** El color con que se ve la pieza elegida; las demás, con el suyo de serie. */
  color: string;
  onCambio: (tipo: TipoMaterial) => void;
  nombre: (texto: string) => string;
}) {
  return <div className="abp-material" role="radiogroup" aria-label={t("Material")}>
    {MATERIALES.map((m) => <button key={m.id} type="button" role="radio" aria-checked={valor === m.id} className={valor === m.id ? "activa" : ""}
      title={nombre(m.nombre)} onClick={() => onCambio(m.id)}>
      <IconoDeMaterial tipo={m.id} color={valor === m.id ? color : m.color} />
      <span>{nombre(m.nombre)}</span>
    </button>)}
  </div>;
}

/** Una ficha en miniatura con el dibujo de la camiseta, para elegirlo de un vistazo. */
function MuestraDePatron({ patron, base, otro }: { patron: Patron; base: string; otro: string }) {
  const id = useId().replace(/:/g, "");
  const dibujo: Record<Patron, ReactNode> = {
    liso: null,
    rayas: <path d="M3.5 0h3v20h-3zM9 0h3v20H9zM14.5 0h3v20h-3z" fill={otro} />,
    aros: <path d="M0 3.5h20v3H0zM0 9h20v3H0zM0 14.5h20v3H0z" fill={otro} />,
    mitades: <rect x="0" y="0" width="10" height="20" fill={otro} />,
    banda: <path d="M-2 4.5L4.5-2 22 15.5 15.5 22z" fill={otro} />,
    degradado: <rect x="0" y="0" width="20" height="20" fill={`url(#g${id})`} />,
  };
  return <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`c${id}`}><circle cx="10" cy="10" r="9" /></clipPath>
      {patron === "degradado" && <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0.15" stopColor={base} /><stop offset="0.95" stopColor={otro} /></linearGradient>}
    </defs>
    <g clipPath={`url(#c${id})`}><rect x="0" y="0" width="20" height="20" fill={base} />{dibujo[patron]}</g>
    <circle cx="10" cy="10" r="9" fill="none" stroke="rgba(0,0,0,.45)" />
  </svg>;
}

/**
 * La equipación de un equipo: el dibujo de la camiseta, su segundo color, el
 * ribete y el color del dorsal. `historial` dice si el cambio va al deshacer
 * de una vez (un botón) o se va escribiendo (un selector de color).
 */
export function EditorDeEquipacion({ titulo, base, equipacion, nombre, onCambio, onEmpezar }: {
  titulo: string;
  /** El color principal del equipo: el de «Nuestro color» o «Su color». */
  base: string;
  equipacion: Equipacion;
  nombre: (texto: string) => string;
  onCambio: (cambios: Partial<Equipacion>, historial: boolean) => void;
  /** Antes de arrastrar un selector de color: guarda el estado para deshacer. */
  onEmpezar: () => void;
}) {
  return <div className="inspector-tarjeta abp-equipacion">
    <div className="inspector-fila"><span>{titulo}</span></div>
    <div className="abp-patrones" role="radiogroup" aria-label={t("Dibujo de la camiseta")}>
      {PATRONES.map((p) => <button key={p.id} type="button" role="radio" aria-checked={equipacion.patron === p.id} className={equipacion.patron === p.id ? "activa" : ""}
        title={nombre(p.nombre)} aria-label={nombre(p.nombre)} onClick={() => onCambio({ patron: p.id }, true)}>
        <MuestraDePatron patron={p.id} base={base} otro={equipacion.secundario} />
      </button>)}
    </div>
    {equipacion.patron !== "liso" && <label className="inspector-fila"><span>{t("Segundo color")}</span>
      <input type="color" value={equipacion.secundario} onFocus={onEmpezar} onChange={(e) => onCambio({ secundario: e.target.value }, false)} />
    </label>}
    <div className="inspector-fila"><span>{t("Ribete")}</span><Interruptor activo={equipacion.ribete} onCambio={(ribete) => onCambio({ ribete }, true)} titulo={t("Ribete")} /></div>
    <div className="inspector-fila"><span>{t("Dorsal")}</span>
      <div className="inspector-segmentos">
        {([["auto", t("Auto")], ["blanco", t("Blanco")], ["negro", t("Negro")]] as const).map(([id, texto]) =>
          <button key={id} type="button" className={equipacion.dorsal === id ? "activa" : ""} onClick={() => onCambio({ dorsal: id }, true)}>{texto}</button>)}
      </div>
    </div>
  </div>;
}

/** Los petos: sin peto o uno de los colores de siempre. Cambia el de una ficha o el de todas las elegidas. */
export function SelectorDePeto({ valor, nombre, onCambio }: { valor: string | undefined; nombre: (texto: string) => string; onCambio: (peto: string | undefined) => void }) {
  return <div className="abp-petos" role="radiogroup" aria-label={t("Peto")}>
    <button type="button" role="radio" aria-checked={!valor} className={!valor ? "activa" : ""} onClick={() => onCambio(undefined)} title={t("Sin peto")} aria-label={t("Sin peto")}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeOpacity=".55" /><path d="M4.5 15.5 15.5 4.5" stroke="currentColor" strokeOpacity=".55" /></svg>
    </button>
    {PETOS.map((p) => <button key={p.color} type="button" role="radio" aria-checked={valor === p.color} className={valor === p.color ? "activa" : ""}
      onClick={() => onCambio(p.color)} title={nombre(p.nombre)} aria-label={nombre(p.nombre)}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M6 2.5h2.5a1.5 1.5 0 0 0 3 0H14l2.5 3v12h-13v-12z" fill={p.color} stroke="rgba(0,0,0,.45)" strokeLinejoin="round" /></svg>
    </button>)}
  </div>;
}

/** Los espacios de juego con su medida: un botón cada uno, con su rectángulo a escala. */
export function EspaciosDeJuego({ nombre, onPoner }: { nombre: (texto: string) => string; onPoner: (espacio: Espacio) => void }) {
  return <div className="abp-espacios">
    {ESPACIOS.map((e) => {
      // El dibujo, a escala entre ellos: el más grande llena el botón.
      const k = 18 / 70, w = Math.max(4, e.largo * k), h = Math.max(4, e.ancho * k);
      return <button key={e.id} type="button" onClick={() => onPoner(e)} title={tf("{largo} × {ancho} m", { largo: e.largo, ancho: e.ancho })}>
        <svg viewBox="0 0 22 16" width="26" height="19" aria-hidden="true">
          <rect x={11 - w / 2} y={8 - h / 2} width={w} height={h} rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          {e.porterias !== "ninguna" && <path d={`M${11 - w / 2} 6.6v2.8M${11 + w / 2} 6.6v2.8`} stroke="currentColor" strokeWidth="2" />}
        </svg>
        <span>{nombre(e.nombre)}</span>
      </button>;
    })}
  </div>;
}
