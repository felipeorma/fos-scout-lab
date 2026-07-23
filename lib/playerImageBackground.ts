type PlayerImageBackgroundProgress = (key: string, current: number, total: number) => void;

type PlayerImageBackgroundRequest = {
  playerImage: string;
  onProgress?: PlayerImageBackgroundProgress;
};

/**
 * Procesa exclusivamente la foto del jugador. Los escudos y logos no deben
 * pasar por esta función: conservan siempre el fondo de su archivo original.
 */
export async function removePlayerImageBackground({
  playerImage,
  onProgress,
}: PlayerImageBackgroundRequest) {
  const source = playerImage.trim();
  if (!source) throw new Error("La foto del jugador está vacía.");

  const imageSource = /^data:|^blob:/i.test(source)
    ? source
    : `https://images.weserv.nl/?url=${encodeURIComponent(source.replace(/^https?:\/\//i, ""))}`;
  const { removeBackground } = await import("@imgly/background-removal");

  return removeBackground(imageSource, {
    model: "small",
    output: { format: "image/png", quality: 1 },
    progress: onProgress,
  });
}
