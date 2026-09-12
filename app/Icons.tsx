import type { CSSProperties, ReactNode } from "react";

type IconProps = { size?: number; className?: string };

/**
 * Iconos dibujados, no glifos.
 *
 * Antes cada icono era un carácter Unicode (▥ ▦ ⌑ ⠿). Se veían desparejos
 * porque cada uno viene de una familia distinta con su propio grosor y su
 * propia caja: un ▦ pesa el triple que una ✓ al mismo tamaño, y varios ni
 * siquiera existen en todas las plataformas.
 *
 * Todos comparten ahora la misma retícula de 24, el mismo trazo de 1.6 y
 * `currentColor`, así que heredan el color de donde se pongan y se alinean
 * entre sí sin corregir nada a mano.
 */
const TRAZO = 1.6;

function icono(nodos: ReactNode, relleno = false) {
  return function Icon({ size = 18, className = "" }: IconProps) {
    return (
      <svg
        aria-hidden="true"
        className={`ui-icon ${className}`}
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={relleno ? "currentColor" : "none"}
        stroke={relleno ? "none" : "currentColor"}
        strokeWidth={TRAZO}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ "--icon-size": `${size}px` } as CSSProperties}
      >
        {nodos}
      </svg>
    );
  };
}

export const ArrowDownToLine = icono(<><path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M5 20h14" /></>);
export const BarChart3 = icono(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>);
export const Check = icono(<path d="m4.5 12.5 5 5L19.5 7" />);
export const ChevronDown = icono(<path d="m6 9.5 6 6 6-6" />);
export const CircleHelp = icono(<><circle cx="12" cy="12" r="9" /><path d="M9.4 9.3a2.7 2.7 0 1 1 3.2 3.4v1.5" /><path d="M12.5 17.4h.01" /></>);
export const FileSpreadsheet = icono(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M8.5 13h7" /><path d="M8.5 17h7" /><path d="M12 13v4" /></>);
export const Files = icono(<><path d="M9 3h5l4 4v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v4h4" /><path d="M4.5 7.5V19a2.5 2.5 0 0 0 2.5 2.5h7" /></>);
export const FolderOpen = icono(<><path d="M3 8.5V6a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2v2" /><path d="m3 9.5 2.2 9A1.6 1.6 0 0 0 6.8 20h10.4a1.6 1.6 0 0 0 1.6-1.5l1.2-9z" /></>);
export const LayoutDashboard = icono(<><rect x="3.5" y="3.5" width="7" height="7" rx="1.3" /><rect x="13.5" y="3.5" width="7" height="4.5" rx="1.3" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.3" /><rect x="13.5" y="11" width="7" height="9.5" rx="1.3" /></>);
export const LockKeyhole = icono(<><rect x="4.5" y="10" width="15" height="10.5" rx="2.2" /><path d="M8 10V7.4a4 4 0 0 1 8 0V10" /><circle cx="12" cy="15.2" r="1.4" /></>);
export const Menu = icono(<><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>);
export const MoreHorizontal = icono(<><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>, true);
export const Merge = icono(<><path d="M6 3v4.6c0 1.2.6 2.3 1.6 3l3.1 2.1c1 .7 1.6 1.8 1.6 3V21" /><path d="M18 3v4.6c0 1.2-.6 2.3-1.6 3L14.5 12" /><path d="m9 18 3.3 3 3.2-3" /></>);
export const Printer = icono(<><path d="M7 9V4h10v5" /><path d="M7 18H5.5A2.5 2.5 0 0 1 3 15.5V12a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 12v3.5a2.5 2.5 0 0 1-2.5 2.5H17" /><rect x="7" y="14.5" width="10" height="6" rx="1.2" /></>);
export const RotateCcw = icono(<><path d="M3.5 5.5v5h5" /><path d="M4.2 10.5a8 8 0 1 1 .3 5" /></>);
export const Search = icono(<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>);
export const ShieldCheck = icono(<><path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" /><path d="m9 12 2.2 2.2L15.4 10" /></>);
export const Sparkles = icono(<><path d="m12 3.5 1.9 4.9 4.9 1.9-4.9 1.9L12 17.1l-1.9-4.9-4.9-1.9 4.9-1.9z" /><path d="M18.5 16.5 19.3 18.5 21.3 19.3 19.3 20.1 18.5 22.1 17.7 20.1 15.7 19.3 17.7 18.5z" /></>);
export const Upload = icono(<><path d="M12 19V8" /><path d="m7.5 12.5 4.5-4.5 4.5 4.5" /><path d="M5 4h14" /></>);
export const X = icono(<><path d="m6 6 12 12" /><path d="m18 6-12 12" /></>);
export const Grip = icono(<><circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" /></>);
export const ImageIcon = icono(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.2" /><circle cx="9" cy="10" r="1.7" /><path d="m4.5 17.5 4.8-4.3a1.8 1.8 0 0 1 2.4 0l4.6 4.1" /><path d="m14.5 14 1.7-1.5a1.8 1.8 0 0 1 2.4 0l1.9 1.7" /></>);
export const TextIcon = icono(<><path d="M5 6.5V5h14v1.5" /><path d="M12 5v14" /><path d="M9 19h6" /></>);
export const Trash = icono(<><path d="M4.5 7h15" /><path d="M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7" /><path d="M6.5 7.5 7.4 19a1.8 1.8 0 0 0 1.8 1.7h5.6a1.8 1.8 0 0 0 1.8-1.7L17.5 7.5" /><path d="M10.5 11.5v5.5" /><path d="M13.5 11.5v5.5" /></>);
export const Palette = icono(<><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h1.4a4.3 4.3 0 0 0 4.3-4.3c0-3.7-3.8-6.7-8.5-6.7z" /><circle cx="8" cy="11" r="1.2" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="16" cy="10.5" r="1.2" fill="currentColor" stroke="none" /></>);
export const Columns = icono(<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M12 4.5v15" /></>);
export const MoveUp = icono(<><path d="M12 19.5V5" /><path d="m6.5 10.5 5.5-5.5 5.5 5.5" /></>);
export const MoveDown = icono(<><path d="M12 4.5V19" /><path d="m6.5 13.5 5.5 5.5 5.5-5.5" /></>);
