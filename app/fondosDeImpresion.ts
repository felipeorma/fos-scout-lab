type Fondo = {
  elemento: HTMLElement;
  pseudo: "" | "::before" | "::after";
  ancho: number;
  alto: number;
  propiedades: Array<[string, string]>;
};

const ATRIBUTO = "data-fos-print-background";
let siguienteLote = 0;
const propiedadesDeFondo = [
  "background-color", "background-image", "background-position", "background-size",
  "background-repeat", "background-origin", "background-clip", "background-attachment",
  "background-blend-mode", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
];

function longitud(valor: string, referencia: number): number | null {
  const medida = /^(-?(?:\d+(?:\.\d*)?|\.\d+))(px|%)$/.exec(valor);
  return medida ? Number(medida[1]) * (medida[2] === "%" ? referencia / 100 : 1) : null;
}

/** Los pseudo-elementos no tienen offsetWidth: se resuelve su caja CSS. */
function dimensionDePseudo(estilo: CSSStyleDeclaration, elemento: HTMLElement, horizontal: boolean): number {
  const referencia = horizontal ? elemento.clientWidth : elemento.clientHeight;
  const lados = horizontal ? ["left", "right"] : ["top", "bottom"];
  const medida = longitud(estilo.getPropertyValue(horizontal ? "width" : "height"), referencia);
  if (medida !== null) {
    const extra = estilo.boxSizing === "border-box" ? 0 : lados.reduce((total, lado) => total
      + (longitud(estilo.getPropertyValue(`padding-${lado}`), referencia) ?? 0)
      + (longitud(estilo.getPropertyValue(`border-${lado}-width`), referencia) ?? 0), 0);
    return medida + extra;
  }
  if (estilo.position === "absolute" || estilo.position === "fixed") {
    const inicio = longitud(estilo.getPropertyValue(lados[0]), referencia);
    const fin = longitud(estilo.getPropertyValue(lados[1]), referencia);
    return inicio !== null && fin !== null ? referencia - inicio - fin : 0;
  }
  return horizontal && estilo.display === "block" ? referencia : 0;
}

/**
 * Convierte solo los fondos degradados en imágenes acotadas. Chrome exporta
 * algunos degradados con alfa como máscaras de luminosidad que Vista rápida
 * de macOS interpreta mal. Texto, SVG, bordes y el resto de la hoja conservan
 * su representación habitual; la pantalla no recibe estas sustituciones.
 */
export async function aplanarFondosDeImpresion(shells: HTMLElement[]): Promise<() => void> {
  const fondos: Fondo[] = [];
  const elementos = new Set(shells.flatMap((shell) => [shell, ...shell.querySelectorAll<HTMLElement>("*")]));
  for (const elemento of elementos) {
    if (!(elemento instanceof HTMLElement) || !elemento.offsetWidth || !elemento.offsetHeight) continue;
    for (const pseudo of ["", "::before", "::after"] as const) {
      const estilo = getComputedStyle(elemento, pseudo || null);
      if (estilo.display === "none" || estilo.visibility === "hidden" || estilo.opacity === "0"
        || (pseudo && (estilo.content === "none" || estilo.content === "normal"))
        || !/gradient\(/i.test(estilo.backgroundImage)) continue;
      const ancho = pseudo ? dimensionDePseudo(estilo, elemento, true) : elemento.offsetWidth;
      const alto = pseudo ? dimensionDePseudo(estilo, elemento, false) : elemento.offsetHeight;
      if (ancho <= 0 || alto <= 0) continue;
      fondos.push({ elemento, pseudo, ancho, alto,
        propiedades: propiedadesDeFondo.map((propiedad) => [propiedad, estilo.getPropertyValue(propiedad)]),
      });
    }
  }
  if (!fondos.length) return () => {};

  const { domToPng } = await import("modern-screenshot");
  const soporte = document.createElement("div");
  soporte.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;";
  document.body.appendChild(soporte);
  const imagenes = new Map<string, string>();
  const capturas: Array<Fondo & { imagen: string }> = [];
  try {
    // Se captura en serie para no multiplicar el uso de canvas en informes largos.
    // Hasta completar todas las imágenes no se toca ningún elemento del informe.
    for (const fondo of fondos) {
      const clave = JSON.stringify([fondo.ancho, fondo.alto, fondo.propiedades]);
      let imagen = imagenes.get(clave);
      if (!imagen) {
        const muestra = document.createElement("div");
        muestra.style.cssText = `display:block;box-sizing:border-box;width:${fondo.ancho}px;height:${fondo.alto}px;border-style:solid;border-color:transparent;`;
        for (const [propiedad, valor] of fondo.propiedades) muestra.style.setProperty(propiedad, valor);
        soporte.appendChild(muestra);
        try {
          // El color de fondo del propio nodo ya compone los fondos opacos;
          // null conserva ese color; un valor explícito lo sustituiría también
          // en el nodo clonado. Los velos sin color siguen teniendo alfa.
          imagen = await domToPng(muestra, { scale: 2, backgroundColor: null, font: false });
          const decodificada = new Image();
          decodificada.src = imagen;
          await decodificada.decode();
          imagenes.set(clave, imagen);
        } finally {
          muestra.remove();
        }
      }
      capturas.push({ ...fondo, imagen });
    }
  } finally {
    soporte.remove();
  }

  const lote = ++siguienteLote;
  const anteriores = new Map<HTMLElement, { anterior: string | null; token: string }>();
  const hoja = document.createElement("style");
  const limpiar = () => {
    hoja.remove();
    for (const [elemento, { anterior, token }] of anteriores) {
      if (elemento.getAttribute(ATRIBUTO) !== token) continue;
      if (anterior === null) elemento.removeAttribute(ATRIBUTO);
      else elemento.setAttribute(ATRIBUTO, anterior);
    }
  };
  try {
    const reglas = capturas.map(({ elemento, pseudo, imagen }) => {
      let estado = anteriores.get(elemento);
      if (!estado) {
        estado = { anterior: elemento.getAttribute(ATRIBUTO), token: `${lote}-${anteriores.size}` };
        anteriores.set(elemento, estado);
        elemento.setAttribute(ATRIBUTO, estado.token);
      }
      // Supera también los fondos !important de las hojas Night al imprimir.
      const selector = `[${ATRIBUTO}="${estado.token}"]`.repeat(4) + pseudo;
      const fondo = `background-image:url("${imagen}")!important;background-color:transparent!important;background-size:100% 100%!important;background-position:0 0!important;background-repeat:no-repeat!important;background-origin:border-box!important;background-clip:border-box!important;background-attachment:scroll!important;background-blend-mode:normal!important;`;
      return { selector, fondo };
    });
    hoja.textContent = reglas.map(({ selector, fondo }) => `body.print-layout-check ${selector}{${fondo}}`).join("\n")
      + `\n@media print{${reglas.map(({ selector, fondo }) => `${selector}{${fondo}}`).join("\n")}}`;
    document.head.appendChild(hoja);
    return limpiar;
  } catch (error) {
    limpiar();
    throw error;
  }
}
