/**
 * Encuadre automático de la foto del jugador.
 *
 * Las fotos recortadas con IA conservan el lienzo original con transparencia
 * alrededor del jugador, y cada retrato de Transfermarkt trae al jugador en
 * una posición distinta dentro de ese lienzo. Con `object-fit: contain` lo que
 * se encuadra es el lienzo, no el jugador: por eso unas fotos quedan altas y
 * otras bajas.
 *
 * Aquí se mide la caja opaca real (los píxeles del jugador) y se devuelve la
 * transformación que la apoya centrada sobre la base del marco.
 */
export type PhotoBox = { x: number; y: number; width: number; height: number };

const ALPHA_THRESHOLD = 12;
/** Muestreo: basta 1 de cada N píxeles para hallar los bordes del recorte. */
const SAMPLE_STEP = 2;

export function opaqueBounds(data: Uint8ClampedArray, width: number, height: number): PhotoBox | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += SAMPLE_STEP) {
    for (let x = 0; x < width; x += SAMPLE_STEP) {
      if (data[(y * width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Transformación que apoya la caja del jugador centrada sobre la base del
 * marco, dejando `bottomPadding` de aire. `transform-origin` debe ser 0 0.
 */
export function framePhotoTransform(box: PhotoBox, frameWidth: number, frameHeight: number, scaleFactor = 1, bottomPadding = 0) {
  const usableHeight = Math.max(1, frameHeight - bottomPadding);
  const scale = Math.min(frameWidth / box.width, usableHeight / box.height) * scaleFactor;
  const translateX = (frameWidth - scale * box.width) / 2 - scale * box.x;
  const translateY = frameHeight - bottomPadding - scale * (box.y + box.height);
  return { scale, translateX, translateY };
}
