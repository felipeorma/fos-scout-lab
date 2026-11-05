/**
 * El color del candidato, elegido CONTRA el del objetivo.
 *
 * Estaba fijo en #e95b3f mientras el objetivo tomaba el acento del cliente.
 * Con Cavalry eso daba #cd2b2b contra #e95b3f: diez grados de tono, o sea el
 * mismo rojo dos veces. En un radar donde lo único que se compara son dos
 * áreas superpuestas, eso no es un detalle estético: no se distingue quién es
 * quién.
 *
 * Se prefiere el azul cuando queda lejos —rojo contra azul es además el par
 * que mejor aguanta el daltonismo— y si no, el tono más alejado que haya. Con
 * el verde de Maldonado el azul se queda a 70 grados, así que ahí sale el
 * naranja, a 125.
 */
const CANDIDATOS = ["#1f5fd6", "#f97316", "#9e07ae", "#43a8a0"] as const;
const AZUL = CANDIDATOS[0];

function tonoDe(hex: string) {
  const limpio = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(limpio.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

function distanciaDeTono(a: string, b: string) {
  const d = Math.abs(tonoDe(a) - tonoDe(b));
  return Math.min(d, 360 - d);
}

export function colorContrastante(colorObjetivo: string) {
  if (distanciaDeTono(colorObjetivo, AZUL) >= 120) return AZUL;
  return [...CANDIDATOS].sort((x, y) => distanciaDeTono(colorObjetivo, y) - distanciaDeTono(colorObjetivo, x))[0];
}

const luminancia = (canales: number[]) => {
  const [r, g, b] = canales.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * El color de un jugador para escribir su nombre sobre la franja oscura del
 * encabezado. Se respeta si se lee (el blanco del objetivo, el rojo del
 * comparable); si es demasiado oscuro se aclara sin perder su tono, y un gris
 * casi negro pasa a blanco, que aclarado quedaría como un gris sucio.
 */
export function colorSobreOscuro(color: string): string {
  const hex = color.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const canales = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const MINIMA = 0.18;
  if (luminancia(canales) >= MINIMA) return `#${hex.toLowerCase()}`;
  if (Math.max(...canales) - Math.min(...canales) < 24) return "#ffffff";
  for (let paso = 1; paso <= 20; paso += 1) {
    const mezcla = canales.map((c) => Math.round(c + (255 - c) * paso / 20));
    if (luminancia(mezcla) >= MINIMA) return `#${mezcla.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  }
  return "#ffffff";
}

/**
 * El texto que se lee sobre un fondo de este color: casi negro sobre los
 * claros, blanco sobre los demás. Con el look Night el jugador objetivo va en
 * blanco, y su rótulo en blanco sobre blanco no se veía.
 */
export function textoSobre(color: string): string {
  const hex = color.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#0b0b0f" : "#ffffff";
}
