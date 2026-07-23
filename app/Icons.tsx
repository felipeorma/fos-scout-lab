import type { CSSProperties } from "react";

type IconProps = { size?: number; className?: string };

function glyph(symbol: string) {
  return function Icon({ size = 18, className = "" }: IconProps) {
    return <span aria-hidden="true" className={`ui-icon ${className}`} style={{ "--icon-size": `${size}px` } as CSSProperties}>{symbol}</span>;
  };
}

export const ArrowDownToLine = glyph("⇩");
export const BarChart3 = glyph("▥");
export const Check = glyph("✓");
export const ChevronDown = glyph("⌄");
export const CircleHelp = glyph("?");
export const FileSpreadsheet = glyph("▦");
export const Files = glyph("▤");
export const FolderOpen = glyph("◫");
export const LayoutDashboard = glyph("▦");
export const LockKeyhole = glyph("⌑");
export const Menu = glyph("≡");
export const Merge = glyph("⇄");
export const Printer = glyph("▣");
export const RotateCcw = glyph("↺");
export const Search = glyph("⌕");
export const ShieldCheck = glyph("◈");
export const Sparkles = glyph("✦");
export const Upload = glyph("↑");
export const X = glyph("×");
