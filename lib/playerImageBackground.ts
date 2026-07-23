import { t } from "./i18n";

type PlayerImageBackgroundProgress = (key: string, current: number, total: number) => void;

type PlayerImageBackgroundRequest = {
  playerImage: string;
  onProgress?: PlayerImageBackgroundProgress;
};

const MASK_DILATE_RADIUS = 2;
const MASK_FEATHER_RADIUS = 1;
const MASK_ALPHA_LOW = 32;
const MASK_ALPHA_HIGH = 160;

// Servidor local de rembg (`npm run bg:server`). Usa BiRefNet portrait,
// muy superior a los modelos que corren en el navegador. Puerto 7001 porque
// el 7000 lo ocupa AirPlay en macOS.
const REMBG_URL = "http://127.0.0.1:7001/api/remove";
const REMBG_MODEL = "birefnet-portrait";
const REMBG_TIMEOUT_MS = 300_000;

/**
 * Procesa exclusivamente la foto del jugador. Los escudos y logos no deben
 * pasar por esta función: conservan siempre el fondo de su archivo original.
 *
 * Estrategia en cascada:
 * 1. Servidor local rembg con BiRefNet portrait (máxima calidad) si está corriendo.
 * 2. Modelo "medium" en el navegador + refinado de máscara — dilatación leve
 *    para recuperar bordes recortados de más, curva de contraste para que los
 *    píxeles dudosos del jugador (pelo, brazos) no queden semitransparentes,
 *    y un suavizado final del contorno.
 * 3. Recorte estándar del navegador como último recurso.
 */
export async function removePlayerImageBackground({
  playerImage,
  onProgress,
}: PlayerImageBackgroundRequest) {
  const source = playerImage.trim();
  if (!source) throw new Error(t("La foto del jugador está vacía."));

  const imageSource = /^data:|^blob:/i.test(source)
    ? source
    : `https://images.weserv.nl/?url=${encodeURIComponent(source.replace(/^https?:\/\//i, ""))}`;

  const response = await fetch(imageSource);
  if (!response.ok) throw new Error(t("No se pudo descargar la foto del jugador."));
  const original = await response.blob();

  try {
    onProgress?.("recorte HD (servidor local)", 0, 0);
    return await removeWithLocalRembg(original);
  } catch {
    // Servidor local apagado o falló: seguimos con el modelo del navegador.
  }

  const { removeBackground, segmentForeground } = await import("@imgly/background-removal");
  const config = {
    model: "medium" as const,
    output: { format: "image/png" as const, quality: 1 },
    progress: onProgress,
  };

  try {
    const mask = await segmentForeground(original, config);
    return await composeWithRefinedMask(original, mask);
  } catch {
    return removeBackground(original, config);
  }
}

async function removeWithLocalRembg(image: Blob): Promise<Blob> {
  const form = new FormData();
  form.append("file", image, "player");
  form.append("model", REMBG_MODEL);
  const response = await fetch(REMBG_URL, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(REMBG_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Servidor rembg respondió ${response.status}.`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("Respuesta inválida del servidor rembg.");
  return blob;
}

async function composeWithRefinedMask(image: Blob, mask: Blob): Promise<Blob> {
  const [imageBitmap, maskBitmap] = await Promise.all([
    createImageBitmap(image),
    createImageBitmap(mask),
  ]);
  const width = imageBitmap.width;
  const height = imageBitmap.height;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas no disponible.");

  ctx.drawImage(maskBitmap, 0, 0, width, height);
  const maskPixels = ctx.getImageData(0, 0, width, height).data;
  let alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = maskPixels[i * 4];

  alpha = dilateMask(alpha, width, height, MASK_DILATE_RADIUS);
  applyAlphaCurve(alpha, MASK_ALPHA_LOW, MASK_ALPHA_HIGH);
  alpha = featherMask(alpha, width, height, MASK_FEATHER_RADIUS);

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  const output = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < alpha.length; i += 1) output.data[i * 4 + 3] = alpha[i];
  ctx.putImageData(output, 0, 0);
  imageBitmap.close();
  maskBitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el PNG."))),
      "image/png",
    );
  });
}

/** Expande la máscara unos píxeles para recuperar bordes recortados de más. */
function dilateMask(src: Uint8ClampedArray, width: number, height: number, radius: number) {
  return separablePass(src, width, height, radius, Math.max);
}

/** Suaviza el contorno de la máscara para evitar bordes serruchados. */
function featherMask(src: Uint8ClampedArray, width: number, height: number, radius: number) {
  const horizontal = boxBlurPass(src, width, height, radius, true);
  return boxBlurPass(horizontal, width, height, radius, false);
}

/**
 * Curva de contraste sobre la probabilidad de "jugador": por debajo de `low`
 * es fondo seguro (alfa 0), por encima de `high` es jugador seguro (alfa 255)
 * y entre medio hay una rampa suave.
 */
function applyAlphaCurve(alpha: Uint8ClampedArray, low: number, high: number) {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v += 1) {
    if (v <= low) lut[v] = 0;
    else if (v >= high) lut[v] = 255;
    else {
      const t = (v - low) / (high - low);
      lut[v] = Math.round(255 * t * t * (3 - 2 * t));
    }
  }
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = lut[alpha[i]];
}

function separablePass(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  pick: (a: number, b: number) => number,
) {
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let value = src[row + x];
      for (let d = 1; d <= radius; d += 1) {
        if (x - d >= 0) value = pick(value, src[row + x - d]);
        if (x + d < width) value = pick(value, src[row + x + d]);
      }
      tmp[row + x] = value;
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let value = tmp[y * width + x];
      for (let d = 1; d <= radius; d += 1) {
        if (y - d >= 0) value = pick(value, tmp[(y - d) * width + x]);
        if (y + d < height) value = pick(value, tmp[(y + d) * width + x]);
      }
      out[y * width + x] = value;
    }
  }
  return out;
}

function boxBlurPass(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
) {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let d = -radius; d <= radius; d += 1) {
        const nx = horizontal ? x + d : x;
        const ny = horizontal ? y : y + d;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        sum += src[ny * width + nx];
        count += 1;
      }
      out[y * width + x] = Math.round(sum / count);
    }
  }
  return out;
}
