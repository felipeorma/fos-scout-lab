/**
 * La geometría del tablero 2D: cómo se pasa de metros del campo a píxeles de
 * pantalla y vuelta, y cómo viaja la cámara de un encuadre a otro.
 *
 * La cámara es un centro y los metros que se ven a lo ancho de la pantalla.
 * Para ir de una a otra se usa el zoom suave de van Wijk y Nuij ("Smooth and
 * efficient zooming and panning", 2003): en un viaje largo se aleja un poco
 * mientras se desplaza y vuelve a acercarse al llegar, que es lo que hace
 * que un cambio de encuadre se vea como una cámara de televisión y no como un
 * salto. Vive aparte del dibujo para poder probarla sin lienzo.
 */

import type { Punto } from "./abp.ts";

export type Caja = { x0: number; x1: number; z0: number; z1: number };
export type Orientacion = "horizontal" | "vertical";
/** El centro de la vista, en metros, y cuántos metros caben a lo ancho de la pantalla. */
export type Camara = { x: number; z: number; w: number };
export type Transformacion = {
  /** Píxeles por metro. */
  escala: number;
  aPantalla: (p: Punto) => { x: number; y: number };
  aCampo: (x: number, y: number) => Punto;
};

/** La cámara que encaja una caja entera en la pantalla, con `margen` metros de aire. */
export function camaraDeCaja(caja: Caja, ancho: number, alto: number, orientacion: Orientacion, margen = 3): Camara {
  const dx = caja.x1 - caja.x0, dz = caja.z1 - caja.z0;
  const [anchoMundo, altoMundo] = orientacion === "vertical" ? [dz, dx] : [dx, dz];
  const w = Math.max(anchoMundo + margen * 2, (altoMundo + margen * 2) * (ancho / Math.max(alto, 1)));
  return { x: (caja.x0 + caja.x1) / 2, z: (caja.z0 + caja.z1) / 2, w };
}

/**
 * De lado, nuestra portería queda a la izquierda y +z (la derecha de quien
 * ataca) abajo, igual que la cámara táctica del 3D. En vertical atacamos
 * hacia arriba y +z queda a la derecha.
 */
export function transformacion(cam: Camara, ancho: number, alto: number, orientacion: Orientacion): Transformacion {
  const escala = ancho / cam.w;
  if (orientacion === "vertical") {
    return {
      escala,
      aPantalla: (p) => ({ x: ancho / 2 + (p.z - cam.z) * escala, y: alto / 2 - (p.x - cam.x) * escala }),
      aCampo: (x, y) => ({ x: cam.x - (y - alto / 2) / escala, z: cam.z + (x - ancho / 2) / escala }),
    };
  }
  return {
    escala,
    aPantalla: (p) => ({ x: ancho / 2 + (p.x - cam.x) * escala, y: alto / 2 + (p.z - cam.z) * escala }),
    aCampo: (x, y) => ({ x: cam.x + (x - ancho / 2) / escala, z: cam.z + (y - alto / 2) / escala }),
  };
}

const RHO = Math.SQRT2;

/**
 * La cámara en el instante `t` (0–1) del viaje de `a` a `b`. En un viaje
 * corto apenas cambia el zoom; en uno largo se aleja y se vuelve a acercar.
 */
export function interpolarCamara(a: Camara, b: Camara, t: number): Camara {
  const dx = b.x - a.x, dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < 1e-9) {
    // Solo zoom: se recorre en escala logarítmica, que es como lo percibe el ojo.
    return { x: a.x + dx * t, z: a.z + dz * t, w: a.w * Math.pow(b.w / a.w, t) };
  }
  const d = Math.sqrt(d2), r2 = RHO * RHO, r4 = r2 * r2;
  const b0 = (b.w * b.w - a.w * a.w + r4 * d2) / (2 * a.w * r2 * d);
  const b1 = (b.w * b.w - a.w * a.w - r4 * d2) / (2 * b.w * r2 * d);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const s = t * ((r1 - r0) / RHO);
  const u = (a.w / (r2 * d)) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0));
  return { x: a.x + u * dx, z: a.z + u * dz, w: (a.w * Math.cosh(r0)) / Math.cosh(RHO * s + r0) };
}

/** El encuadre que abarca unos puntos, con aire alrededor: para "Centrar jugada". */
export function cajaDe(puntos: Punto[], aire = 8, minimo = 24): Caja {
  const xs = puntos.map((p) => p.x), zs = puntos.map((p) => p.z);
  let x0 = Math.min(...xs) - aire, x1 = Math.max(...xs) + aire, z0 = Math.min(...zs) - aire, z1 = Math.max(...zs) + aire;
  if (x1 - x0 < minimo) { const c = (x0 + x1) / 2; x0 = c - minimo / 2; x1 = c + minimo / 2; }
  if (z1 - z0 < minimo * 0.65) { const c = (z0 + z1) / 2; z0 = c - minimo * 0.325; z1 = c + minimo * 0.325; }
  return { x0, x1, z0, z1 };
}

/** "Primer palo" cabe en una ficha como "PP"; "DFC" o "9" caben tal cual. */
export function abreviar(texto: string) {
  const limpio = texto.trim();
  if (limpio.length <= 3) return limpio.toUpperCase();
  const palabras = limpio.split(/\s+/).filter(Boolean);
  return (palabras.length > 1 ? palabras.map((p) => p[0]).join("") : limpio.slice(0, 3)).slice(0, 3).toUpperCase();
}
