"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoDePuntero, type ReactNode } from "react";
import {
  agregarAnotacion, agregarFase, agregarFicha, anotacionCerca, cambiarAnotacion, cambiarDuracion, cambiarFicha, carreraDe, cuadernoInicial,
  curvarCarrera, desplazarAnotacion, distancia, duplicarFase, duracionTotal, fichaCerca, fijarCarrera, fijarPase, inicioDeFase, instanteEn,
  moverFase, posar, posarBalon, cambiarPausa, AMBIENTE_POR_DEFECTO, agregarMaterial, cambiarEquipacion, cambiarMaterial, datosDeMaterial, equipacionDe,
  filaDeMaterial, materialCerca, moverMaterial, quitarMaterial, EQUIPACION_LISA, copiaDeAnotacion, extremosDe, normalizarCuaderno, nuevoId, quitarAnotacion, quitarCarrera, quitarFase, quitarFicha, quitarPase,
  renombrarFase, tipoDePase, deSerie, CATEGORIAS, ENCUADRES, SUPERFICIES, ZONAS,
  type Ambiente, type Anotacion, type Capa, type Categoria, type Cuaderno, type Equipacion, type Equipo, type EstiloFlecha, type EstiloZona, type Extremo,
  type Fase, type Grosor, type Jugada, type Material, type Pase, type Punto, type RellenoBloque, type TipoMaterial,
} from "@/lib/abp";
import { simplificar } from "@/lib/geometria";
import { t, tf, type Lang } from "@/lib/i18n";
import type { Borrador, Motor, Opciones, Seleccion, Vista } from "./abp/motor";
import { Tablero2D } from "./abp/tablero2d";
import { useFirma } from "./FirmaDelInforme";
import { Interruptor } from "./Interruptor";
import { Biblioteca } from "./BibliotecaDeSistemas";
import { Portal, archivoDeCuaderno, archivoDeSistema } from "./PortalDeSistemas";
import { EditorDeEquipacion, SelectorDeMaterial } from "./abp/PiezasDeEntrenamiento";
import {
  ArrowDownToLine, Balon, Bloque, Carrera, ChevronLeft, ChevronRight, Conduccion, Cono, Cubo, Duplicar, Elipse, Etiqueta, Flecha, Linea, Mover, PantallaCompleta,
  Pase as PaseIcono, Pause, Pencil, Play, Plus, Presion, Rectangulo, Regla, RotateCcw, RotateCw, Teclado, TextIcon, Trash, Video,
} from "./Icons";
import { PanelDeMedidas } from "./abp/PanelDeMedidas";
import type { Entrante } from "./abp/AbrirEnPizarra";
import { enlaceDeJugada } from "@/lib/enlace";

// La clave no cambia al pasar de cuaderno a estudio: así se abre lo ya guardado.
const CLAVE = "fos-scout-abp-v1";
const CLAVE_MINIATURAS = "fos-scout-abp-miniaturas-v1";

type Herramienta = "mover" | "local" | "rival" | "balon" | "material" | "carrera" | "pase" | "flecha" | "texto" | "etiqueta" | "rect" | "zona"
  | "lapiz" | "medida" | "bloque";

/** Lo que se está arrastrando, con el cuaderno de antes para poder deshacerlo de una vez. */
type Arrastre = {
  /** "pieza": mover una pieza de material ya puesta; "material": poner piezas nuevas. */
  tipo: "ficha" | "balon" | "anotacion" | "pieza" | "carrera" | "pase" | "flecha" | "rect" | "zona" | "material" | "medida" | "trazo";
  id?: string;
  base: Cuaderno;
  desde: Punto;
  movido: boolean;
  /** El trazo a mano alzada, punto a punto. */
  puntos?: Punto[];
  /** Con Alt pulsado, la ficha no se alinea con las demás. */
  libre?: boolean;
};

const formatosDeMetros = new Map<string, Intl.NumberFormat>();
/** «12,4» en español y «12.4» en inglés: el formato, hecho una vez por idioma. */
function metrosConUnDecimal(idioma: Lang) {
  let f = formatosDeMetros.get(idioma);
  if (!f) {
    f = new Intl.NumberFormat(idioma === "en" ? "en-GB" : "es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    formatosDeMetros.set(idioma, f);
  }
  return f;
}

const activaDe = (c: Cuaderno) => c.jugadas.find((j) => j.id === c.activa) ?? c.jugadas[0];
const conJugada = (c: Cuaderno, j: Jugada): Cuaderno => ({ ...c, jugadas: c.jugadas.map((x) => (x.id === j.id ? { ...j, actualizada: Date.now() } : x)) });

/** Un nombre de archivo sin tildes ni espacios. */
const archivo = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "jugada";

function descargar(href: string, nombre: string) {
  const a = Object.assign(document.createElement("a"), { href, download: nombre });
  a.click();
  if (href.startsWith("blob:")) window.setTimeout(() => URL.revokeObjectURL(href), 2000);
}

/** Los roles de serie, para el desplegable: se pueden escribir otros. */
const ROLES = [
  "POR", "LI", "DFC", "LD", "MCD", "MC", "MP", "EI", "ED", "DC",
  "Lanzador", "Primer palo", "Segundo palo", "Remate", "Arrastre", "Bloqueo", "Rechace", "Vigilancia", "Portero", "Zona", "Marca", "Barrera", "Frontal", "Contra",
];

/**
 * El estudio táctico: el portal con los sistemas guardados y, al abrir uno,
 * la pizarra 3D por fases. Antes era solo el cuaderno de balón parado; lo
 * guardado entonces se abre igual, con noche y estadio.
 */
export function EstudioTactico({ claseHoja, idioma, paleta, onVolver, entrante = null, onEntrante }: {
  claseHoja: string;
  /** Solo para volver a dibujar los rótulos al cambiar de idioma. */
  idioma: Lang;
  /** La paleta del espacio: al cambiar, la grada y las fichas propias toman su color. */
  paleta: string;
  /** Sin datos cargados no hay menú de secciones: este botón lleva de vuelta a la portada. */
  onVolver?: () => void;
  /** Un sistema que llega de un enlace o de otra página: se guarda una copia y se abre. */
  entrante?: Entrante | null;
  onEntrante?: () => void;
}) {
  const firma = useFirma();
  const deSerieEn = (texto: string) => deSerie(texto, idioma);
  const [cuaderno, setCuaderno] = useState<Cuaderno | null>(null);
  const historial = useRef<Cuaderno[]>([]);
  // Lo deshecho, para rehacerlo; se vacía con el primer cambio nuevo.
  const futuro = useRef<Cuaderno[]>([]);
  // Lo copiado con Ctrl+C: la anotación tal cual y suelta (si se pega en otro sistema), o una pieza.
  const portapapeles = useRef<{ jugada: string; fase: number; anotacion?: Anotacion; suelta?: Anotacion; pieza?: Material } | null>(null);
  const [faseIdx, setFaseIdx] = useState(0);
  const [herramienta, setHerramienta] = useState<Herramienta>("mover");
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [borrador, setBorrador] = useState<Borrador>(null);
  const [origen, setOrigen] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("tactica");
  const [nombres, setNombres] = useState(true);
  const [modo, setModo] = useState<"portal" | "biblioteca" | "estudio">("portal");
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const [estiloFlecha, setEstiloFlecha] = useState<EstiloFlecha>("continua");
  const [seguir, setSeguir] = useState(false);
  const [estiloZona, setEstiloZona] = useState<EstiloZona>("translucida");
  // Cómo sale la próxima flecha (null: el extremo de su trazo), el lápiz y el bloque.
  const [extremoFlecha, setExtremoFlecha] = useState<Extremo | null>(null);
  const [grosorFlecha, setGrosorFlecha] = useState<Grosor>("normal");
  const [grosorTrazo, setGrosorTrazo] = useState<Grosor>("normal");
  const [puntaTrazo, setPuntaTrazo] = useState(false);
  const [rellenoBloque, setRellenoBloque] = useState<RellenoBloque>("atras");
  const [atajos, setAtajos] = useState(false);
  // Abierto desde un enlace: solo el campo, para mirarlo; «Editar» enseña las herramientas.
  const [soloVer, setSoloVer] = useState(false);
  const [tipoPase, setTipoPase] = useState<Pase["tipo"]>("aereo");
  // Cómo se pone el material: la pieza, su color (null = el de serie), cada cuántos metros y si en slalom.
  const [tipoMaterial, setTipoMaterial] = useState<TipoMaterial>("seta");
  const [colorMaterial, setColorMaterial] = useState<string | null>(null);
  const [separacion, setSeparacion] = useState(2);
  const [slalom, setSlalom] = useState(false);
  const colorDeMaterial = colorMaterial ?? datosDeMaterial(tipoMaterial).color;
  const [reproduciendo, setReproduciendo] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [lista, setLista] = useState(false);
  const [acento, setAcento] = useState("#ff3b30");
  const [fuente, setFuente] = useState("Geist, \"Helvetica Neue\", Arial, sans-serif");
  // Sube cuando la escena se dibujó por fuera (al exportar) y hay que volver a montarla.
  const [remontar, setRemontar] = useState(0);
  const raizRef = useRef<HTMLElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const escenaRef = useRef<Motor | null>(null);
  const tiempoRef = useRef(0);
  const montadaRef = useRef(-1);
  const ocupadaRef = useRef(false);
  const barraRef = useRef<HTMLInputElement>(null);
  const arrastreRef = useRef<Arrastre | null>(null);
  const textoRef = useRef<HTMLInputElement>(null);
  const fotografoRef = useRef<HTMLDivElement>(null);
  const [fotosDeFases, setFotosDeFases] = useState<string[]>([]);
  const [zoom, setZoom] = useState(100);

  const jugada = cuaderno ? activaDe(cuaderno) : null;
  const indice = jugada ? Math.min(faseIdx, jugada.fases.length - 1) : 0;
  const fase: Fase | null = jugada?.fases[indice] ?? null;
  const total = jugada ? duracionTotal(jugada) : 0;

  // ---- Leer y guardar ----
  useEffect(() => {
    let leido: Cuaderno | null = null;
    let fotos: Record<string, string> = {};
    try {
      const crudo = window.localStorage.getItem(CLAVE);
      if (crudo) leido = normalizarCuaderno(JSON.parse(crudo));
      const guardadas = JSON.parse(window.localStorage.getItem(CLAVE_MINIATURAS) ?? "{}");
      if (guardadas && typeof guardadas === "object") fotos = guardadas;
    } catch { /* sin almacenamiento: se empieza de cero */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el cliente
    setCuaderno(leido ?? cuadernoInicial());
    setMiniaturas(fotos);
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => {
      try { window.localStorage.setItem(CLAVE_MINIATURAS, JSON.stringify(miniaturas)); } catch { /* sin sitio: el portal enseña el icono */ }
    }, 600);
    return () => window.clearTimeout(id);
  }, [miniaturas]);
  useEffect(() => {
    if (!cuaderno) return;
    const id = window.setTimeout(() => {
      try { window.localStorage.setItem(CLAVE, JSON.stringify(cuaderno)); } catch { /* lleno o bloqueado: sigue en memoria */ }
    }, 400);
    return () => window.clearTimeout(id);
  }, [cuaderno]);

  // Un sistema que llega de fuera: una copia en «Tus sistemas», abierta.
  useEffect(() => {
    if (!entrante || !cuaderno) return;
    /* eslint-disable react-hooks/set-state-in-effect -- llega de fuera una vez y se consume */
    if (entrante.jugada) {
      crear({ ...entrante.jugada, id: nuevoId("j"), actualizada: Date.now() });
      setSoloVer(entrante.soloVer);
      setAviso(entrante.origen === "partido" ? t("Preparado desde El partido: los dos onces, el bloque del rival y las medidas. Es tu copia: cámbiala a gusto.") : "");
    } else {
      setModo("portal");
      setAviso(t("Ese enlace está incompleto o roto: pide que te lo vuelvan a enviar."));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    onEntrante?.();
  }, [entrante, cuaderno]); // eslint-disable-line react-hooks/exhaustive-deps

  // El color y la letra del espacio activo, leídos del CSS: la grada y las fichas propias los siguen.
  useEffect(() => {
    const el = raizRef.current;
    if (!el) return;
    const estilo = getComputedStyle(el);
    const color = estilo.getPropertyValue("--acento").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) setAcento(color);
    if (estilo.fontFamily) setFuente(estilo.fontFamily);
  }, [paleta]);

  // ---- El motor: el tablero 2D al momento; el 3D, con three.js, solo si se pide ----
  const dimension = jugada?.ambiente.dimension ?? "2d";
  // Sube cada vez que se cambia de motor, para volver a montar la fase en el nuevo.
  const [motorVersion, setMotorVersion] = useState(0);
  useEffect(() => {
    let vivo = true;
    let motor: Motor | null = null;
    const poner = (nuevo: Motor) => {
      motor = nuevo;
      escenaRef.current = nuevo;
      setLista(true);
      setMotorVersion((n) => n + 1);
    };
    /* eslint-disable react-hooks/set-state-in-effect -- el motor es un sistema externo: se crea y se avisa */
    setError("");
    if (dimension === "2d") {
      if (contenedorRef.current) poner(new Tablero2D(contenedorRef.current));
    } else {
      setLista(false);
      import("./abp/escena").then(({ EscenaABP: Clase }) => {
        if (!vivo || !contenedorRef.current) return;
        try {
          poner(new Clase(contenedorRef.current));
        } catch {
          setError(t("Este navegador no puede dibujar en 3D: WebGL está desactivado."));
        }
      }).catch(() => { if (vivo) setError(t("No se pudo cargar el motor 3D. Revisa la conexión y vuelve a abrir el cuaderno.")); });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      vivo = false;
      motor?.destruir();
      escenaRef.current = null;
    };
  }, [dimension]);

  const colorLocal = jugada?.colores.local ?? acento;
  const colorRival = jugada?.colores.rival ?? "#e8e8ed";
  const colorAnotacion = jugada?.colores.anotacion ?? "#f3b64c";
  const ambiente = jugada?.ambiente;
  const equipacionLocal = jugada ? equipacionDe(jugada, "local") : null;
  const equipacionRival = jugada ? equipacionDe(jugada, "rival") : null;
  const opciones = useMemo<Opciones>(() => ({
    colorLocal, colorRival, colorAnotacion, acento, nombres, fuente,
    ambiente: ambiente ?? AMBIENTE_POR_DEFECTO,
    equipaciones: { local: equipacionLocal ?? EQUIPACION_LISA, rival: equipacionRival ?? EQUIPACION_LISA },
    rotulo: (rol) => deSerie(rol, idioma),
    metros: (m) => `${metrosConUnDecimal(idioma).format(m)} m`,
  }), [colorLocal, colorRival, colorAnotacion, acento, nombres, fuente, idioma, ambiente, equipacionLocal, equipacionRival]);

  useEffect(() => {
    const escena = escenaRef.current;
    if (!lista || !escena || !jugada || ocupadaRef.current) return;
    escena.montar(jugada, indice, opciones, seleccion, borrador);
    montadaRef.current = indice;
    // En pausa a mitad de una fase, las fichas se quedan donde estaban.
    const ahora = instanteEn(jugada, tiempoRef.current);
    if (ahora.fase === indice) escena.instante(ahora.t);
  }, [lista, jugada, indice, opciones, seleccion, borrador, remontar, motorVersion]);

  // La cámara va al encuadre al cambiar de vista, de encuadre o de sistema.
  const encuadre = ambiente?.encuadre ?? "campo";
  const jugadaId = jugada?.id;
  const orientacion = ambiente?.orientacion ?? "horizontal";
  useEffect(() => { escenaRef.current?.vista(vista, encuadre, fase ? centroDe(fase) : null); }, [vista, lista, encuadre, jugadaId, modo, motorVersion, orientacion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (escenaRef.current) escenaRef.current.seguirBalon = seguir && reproduciendo; }, [seguir, reproduciendo, lista, motorVersion]);

  // La foto del portal: un rato después del último cambio, lo que se ve en el campo.
  useEffect(() => {
    if (modo !== "estudio" || !lista || !jugada || reproduciendo || grabando) return;
    const id = window.setTimeout(() => {
      const escena = escenaRef.current;
      if (!escena || !escena.canvas.width) return;
      escena.renderizarAhora();
      const lienzo = document.createElement("canvas");
      lienzo.width = 384;
      lienzo.height = 216;
      lienzo.getContext("2d")!.drawImage(escena.canvas, 0, 0, 384, 216);
      const foto = lienzo.toDataURL("image/jpeg", 0.72);
      setMiniaturas((actuales) => ({ ...actuales, [jugada.id]: foto }));
    }, 1200);
    return () => window.clearTimeout(id);
  }, [modo, lista, jugada, reproduciendo, grabando, indice]);

  // La tira de fases: una foto de cada pose, hecha con un tablero 2D aparte que
  // no se ve. Se rehace un rato después del último cambio, nunca reproduciendo.
  useEffect(() => {
    if (modo !== "estudio" || !jugada || reproduciendo || grabando) return;
    const id = window.setTimeout(() => {
      const caja = fotografoRef.current;
      if (!caja || !caja.clientWidth) return;
      const fotografo = new Tablero2D(caja);
      try {
        const fotos = jugada.fases.map((_, i) => {
          fotografo.montar(jugada, i, { ...opciones, nombres: false }, null, null);
          fotografo.vista("tactica", encuadre, null, true);
          return fotografo.capturar("image/jpeg", 0.7);
        });
        setFotosDeFases(fotos);
      } finally {
        fotografo.destruir();
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [modo, jugada, opciones, reproduciendo, grabando, encuadre, orientacion]);

  // El zoom vuelve a 100 % con cada encuadre nuevo.
  useEffect(() => { setZoom(100); }, [encuadre, orientacion, jugadaId, dimension]); // eslint-disable-line react-hooks/set-state-in-effect

  // ---- Reproducir ----
  useEffect(() => {
    if (!reproduciendo || !jugada) return;
    let previo = performance.now();
    let cuadro = 0;
    const paso = (ahora: number) => {
      tiempoRef.current = Math.min(total, tiempoRef.current + (ahora - previo) / 1000);
      previo = ahora;
      const { fase: f, t: tt } = instanteEn(jugada, tiempoRef.current);
      if (f !== montadaRef.current) setFaseIdx(f);
      else escenaRef.current?.instante(tt);
      if (barraRef.current) barraRef.current.value = String(tiempoRef.current);
      if (tiempoRef.current >= total) { setReproduciendo(false); return; }
      cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [reproduciendo, jugada, total]);

  /** `nueva`: se acaba de abrir otro sistema y el de este render ya no vale para medir el tiempo. */
  function irAFase(i: number, nueva = false) {
    if (!jugada && !nueva) return;
    setReproduciendo(false);
    tiempoRef.current = nueva || !jugada ? 0 : inicioDeFase(jugada, i);
    if (barraRef.current) barraRef.current.value = String(tiempoRef.current);
    setFaseIdx(i);
    setSeleccion(null);
    setOrigen(null);
    escenaRef.current?.instante(0);
  }

  function alternarReproduccion() {
    if (!jugada) return;
    if (reproduciendo) { setReproduciendo(false); return; }
    if (tiempoRef.current >= total - 1e-3) { tiempoRef.current = 0; setFaseIdx(0); }
    setSeleccion(null);
    setReproduciendo(true);
  }

  // ---- Cambiar la jugada ----
  /** Apunta el estado de antes de un cambio para poder deshacerlo; lo deshecho ya no se puede rehacer. */
  function apuntar(previo: Cuaderno) {
    historial.current.push(previo);
    if (historial.current.length > 80) historial.current.shift();
    futuro.current = [];
  }

  function guardar(siguiente: Jugada) {
    if (!cuaderno) return;
    apuntar(cuaderno);
    setCuaderno(conJugada(cuaderno, siguiente));
  }

  /** Para lo que se cambia tecla a tecla: un solo paso de deshacer por edición. */
  function marcarHistorial() {
    if (!cuaderno) return;
    apuntar(cuaderno);
  }
  function sinHistorial(siguiente: Jugada) {
    setCuaderno((actual) => (actual ? conJugada(actual, siguiente) : actual));
  }

  function deshacer() {
    const previo = historial.current.pop();
    if (!previo) return;
    if (cuaderno) futuro.current.push(cuaderno);
    setCuaderno(previo);
    setSeleccion(null);
    setOrigen(null);
  }

  function rehacer() {
    const siguiente = futuro.current.pop();
    if (!siguiente) return;
    if (cuaderno) historial.current.push(cuaderno);
    setCuaderno(siguiente);
    setSeleccion(null);
    setOrigen(null);
  }

  /** La dirección de una flecha del teclado en el campo, según cómo se esté viendo: la del eje del campo más parecido. */
  function direccionDeTecla(dx: number, dy: number): Punto | null {
    const escena = escenaRef.current;
    if (!escena) return null;
    const r = escena.canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const a = escena.puntoDelCampo(cx, cy), b = escena.puntoDelCampo(cx + dx * 40, cy + dy * 40);
    if (!a || !b) return null;
    const vx = b.x - a.x, vz = b.z - a.z;
    return Math.abs(vx) >= Math.abs(vz) ? { x: Math.sign(vx), z: 0 } : { x: 0, z: Math.sign(vz) };
  }

  /** Mueve lo elegido `paso` metros con las flechas del teclado. */
  function empujar(dx: number, dy: number, paso: number) {
    if (!jugada || !fase || !seleccion) return;
    const d = direccionDeTecla(dx, dy);
    if (!d) return;
    const mx = d.x * paso, mz = d.z * paso;
    if (seleccion.tipo === "ficha") {
      const p = fase.pos[seleccion.id];
      if (p) guardar(posar(jugada, indice, seleccion.id, { x: p.x + mx, z: p.z + mz }));
    } else if (seleccion.tipo === "anotacion") {
      guardar(desplazarAnotacion(jugada, indice, seleccion.id, mx, mz));
    } else {
      const m = fase.material?.find((x) => x.id === seleccion.id);
      if (m) guardar(moverMaterial(jugada, indice, m.id, { x: m.p.x + mx, z: m.p.z + mz }));
    }
  }

  /** Ctrl+C: lo elegido, para pegarlo en esta fase, en otra o en otro sistema. */
  function copiar() {
    if (!jugada || !fase || !seleccion || seleccion.tipo === "ficha") return false;
    if (seleccion.tipo === "anotacion") {
      const a = fase.anotaciones.find((x) => x.id === seleccion.id);
      if (!a) return false;
      portapapeles.current = { jugada: jugada.id, fase: indice, anotacion: structuredClone(a), suelta: a.tipo === "bloque" ? undefined : copiaDeAnotacion(a, fase, 0, 0) };
    } else {
      const m = fase.material?.find((x) => x.id === seleccion.id);
      if (!m) return false;
      portapapeles.current = { jugada: jugada.id, fase: indice, pieza: structuredClone(m) };
    }
    return true;
  }

  /**
   * Ctrl+V: en otra fase del mismo sistema cae en el mismo sitio y sigue
   * pegado a sus jugadores; en la misma fase, un poco al lado; en otro
   * sistema, suelto (sus jugadores son otros).
   */
  function pegar() {
    const pp = portapapeles.current;
    if (!pp || !jugada || !fase) return;
    const mismoSistema = pp.jugada === jugada.id, mismaFase = mismoSistema && pp.fase === indice;
    const d = mismaFase ? 1.5 : 0;
    if (pp.pieza) {
      const pieza = { ...pp.pieza, id: nuevoId("m"), p: { x: pp.pieza.p.x + d, z: pp.pieza.p.z + d } };
      guardar(agregarMaterial(jugada, indice, [pieza]));
      setSeleccion({ tipo: "material", id: pieza.id });
      return;
    }
    const original = pp.anotacion;
    if (!original) return;
    let nueva: Anotacion | null;
    if (!mismoSistema) nueva = pp.suelta ? { ...structuredClone(pp.suelta), id: nuevoId("a") } : null;
    else if (mismaFase) nueva = original.tipo === "bloque" ? null : copiaDeAnotacion(original, fase, d, d);
    else nueva = { ...structuredClone(original), id: nuevoId("a") };
    if (!nueva) { setAviso(t("Un bloque va con sus jugadores: se pega en otra fase del mismo sistema.")); return; }
    guardar(agregarAnotacion(jugada, indice, nueva));
    setSeleccion({ tipo: "anotacion", id: nueva.id });
  }

  /** El bloque que se está formando, ya en el campo. */
  function cerrarBloque() {
    if (!jugada || borrador?.tipo !== "bloque" || !borrador.fichas.length) return;
    const id = nuevoId("a");
    guardar(agregarAnotacion(jugada, indice, { id, tipo: "bloque", fichas: borrador.fichas, color: jugada.colores.anotacion, relleno: borrador.relleno }));
    setBorrador(null);
    setSeleccion({ tipo: "anotacion", id });
  }

  /** Ocultar o enseñar una capa en toda la jugada (y en lo que se descargue). */
  function alternarCapa(capas: Capa[], ver: boolean) {
    if (!jugada) return;
    const ocultas = (jugada.ambiente.ocultas ?? []).filter((c) => !capas.includes(c));
    cambiarAmbiente({ ocultas: ver ? ocultas : [...ocultas, ...capas] });
  }

  function borrarSeleccion() {
    if (!jugada || !seleccion) return;
    guardar(seleccion.tipo === "ficha" ? quitarFicha(jugada, seleccion.id)
      : seleccion.tipo === "material" ? quitarMaterial(jugada, indice, seleccion.id)
        : quitarAnotacion(jugada, indice, seleccion.id));
    setSeleccion(null);
  }

  // Teclado: borrar, deshacer y salir. Solo con el cuaderno a la vista y sin estar escribiendo.
  useEffect(() => {
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (!raizRef.current?.offsetParent) return;
      const objetivo = evento.target as HTMLElement;
      if (objetivo.closest("input, textarea, select, [contenteditable='true']")) return;
      if (modo !== "estudio" || !jugada) return;
      const tecla = evento.key.toLowerCase(), mando = evento.metaKey || evento.ctrlKey;
      const flechas: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      if ((evento.key === "Delete" || evento.key === "Backspace") && seleccion) { evento.preventDefault(); borrarSeleccion(); }
      else if (mando && tecla === "z" && evento.shiftKey) { evento.preventDefault(); rehacer(); }
      else if (mando && tecla === "z") { evento.preventDefault(); deshacer(); }
      else if (mando && tecla === "y") { evento.preventDefault(); rehacer(); }
      else if (mando && tecla === "c") { if (copiar()) evento.preventDefault(); }
      else if (mando && tecla === "v") { if (portapapeles.current) { evento.preventDefault(); pegar(); } }
      else if (mando && tecla === "d") { evento.preventDefault(); if (copiar()) pegar(); }
      else if (evento.key === "Escape") { setOrigen(null); setBorrador(null); setSeleccion(null); setAtajos(false); }
      else if (evento.key === "Enter" && borrador?.tipo === "bloque") { evento.preventDefault(); cerrarBloque(); }
      else if (flechas[tecla] && seleccion && !mando) { evento.preventDefault(); empujar(...flechas[tecla], evento.shiftKey ? 2 : 0.5); }
      else if (mando || evento.altKey) return;
      // Los atajos de siempre: espacio reproduce, N añade una fase, [ y ] (o 1 a 9) cambian de fase, H oculta las flechas.
      else if (evento.key === " ") { evento.preventDefault(); alternarReproduccion(); }
      else if (tecla === "n") { guardar(agregarFase(jugada, indice, tf("Fase {n}", { n: jugada.fases.length + 1 }))); irAFase(indice + 1); }
      else if (evento.key === "[" && indice > 0) irAFase(indice - 1);
      else if (evento.key === "]" && indice < jugada.fases.length - 1) irAFase(indice + 1);
      else if (/^[1-9]$/.test(evento.key) && Number(evento.key) <= jugada.fases.length) irAFase(Number(evento.key) - 1);
      else if (tecla === "h") alternarCapa(["flechas", "recorridos"], (jugada.ambiente.ocultas ?? []).includes("flechas"));
      else if (evento.key === "?") setAtajos((a) => !a);
    };
    window.addEventListener("keydown", alPulsarTecla);
    return () => window.removeEventListener("keydown", alPulsarTecla);
  });

  // ---- El puntero sobre el campo ----
  function punto(evento: EventoDePuntero) {
    return escenaRef.current?.puntoDelCampo(evento.clientX, evento.clientY) ?? null;
  }

  /** Se va a dibujar o arrastrar: la cámara se queda quieta hasta soltar. */
  function tomar(evento: EventoDePuntero<HTMLDivElement>, arrastre: Arrastre) {
    if (escenaRef.current) escenaRef.current.orbitar = false;
    evento.currentTarget.setPointerCapture(evento.pointerId);
    arrastreRef.current = arrastre;
  }

  function alPulsar(evento: EventoDePuntero<HTMLDivElement>) {
    // Mirando un enlace no se edita: un dedo en el móvil no mueve a nadie sin querer.
    if (evento.button !== 0 || !cuaderno || !jugada || !fase || grabando || soloVer) return;
    if ((evento.target as HTMLElement).closest(".abp-flotante")) return;
    const p = punto(evento);
    if (!p) return;
    // Editar siempre sobre el arranque de la fase: es lo que se ve con sus recorridos.
    if (reproduciendo || Math.abs(tiempoRef.current - inicioDeFase(jugada, indice)) > 1e-3) irAFase(indice);
    setAviso("");
    const base = cuaderno;
    switch (herramienta) {
      case "mover": {
        const ficha = fichaCerca(fase, p);
        if (ficha) { setSeleccion({ tipo: "ficha", id: ficha }); tomar(evento, { tipo: "ficha", id: ficha, base, desde: p, movido: false }); return; }
        if (distancia(fase.balon, p) < 1.3) { tomar(evento, { tipo: "balon", base, desde: p, movido: false }); return; }
        const pieza = materialCerca(fase, p);
        if (pieza) { setSeleccion({ tipo: "material", id: pieza }); tomar(evento, { tipo: "pieza", id: pieza, base, desde: p, movido: false }); return; }
        const anotacion = anotacionCerca(fase, p, 1.2, jugada.ambiente.ocultas);
        if (anotacion) { setSeleccion({ tipo: "anotacion", id: anotacion }); tomar(evento, { tipo: "anotacion", id: anotacion, base, desde: p, movido: false }); return; }
        // En el vacío no se toma nada: el arrastre gira la cámara.
        setSeleccion(null);
        return;
      }
      case "local":
      case "rival": {
        const [siguiente, id] = agregarFicha(jugada, herramienta, p);
        guardar(siguiente);
        setSeleccion({ tipo: "ficha", id });
        return;
      }
      case "balon":
        guardar(posarBalon(jugada, indice, p));
        return;
      case "material":
        // Un clic pone una pieza; arrastrar pone una fila, cada `separacion` metros.
        setBorrador({ tipo: "material", a: p, b: p, material: { tipo: tipoMaterial, separacion, slalom, color: colorDeMaterial } });
        tomar(evento, { tipo: "material", base, desde: p, movido: false });
        return;
      case "carrera": {
        const ficha = fichaCerca(fase, p);
        if (ficha) {
          setSeleccion({ tipo: "ficha", id: ficha });
          setBorrador({ tipo: "carrera", a: fase.pos[ficha], b: p, fichaId: ficha });
          tomar(evento, { tipo: "carrera", id: ficha, base, desde: fase.pos[ficha], movido: false });
          return;
        }
        if (origen) {
          guardar(fijarCarrera(jugada, indice, origen, p));
          setOrigen(null);
          return;
        }
        setAviso(t("Pulsa primero la ficha que hace la carrera."));
        return;
      }
      case "pase":
        setBorrador({ tipo: "pase", a: fase.balon, b: p });
        tomar(evento, { tipo: "pase", base, desde: fase.balon, movido: false });
        return;
      case "flecha":
      case "medida": {
        // Empezar sobre una ficha pega el trazo a ella: va con ella cuando se mueve.
        const ficha = fichaCerca(fase, p, 1.5);
        const a = ficha ? fase.pos[ficha] : p;
        setBorrador(herramienta === "flecha"
          ? { tipo: "flecha", a, b: p, estilo: estiloFlecha, extremo: extremoFlecha ?? undefined, grosor: grosorFlecha, desde: ficha ?? undefined }
          : { tipo: "medida", a, b: p, desde: ficha ?? undefined });
        tomar(evento, { tipo: herramienta, id: ficha ?? undefined, base, desde: a, movido: false });
        return;
      }
      case "rect":
      case "zona":
        setBorrador({ tipo: herramienta, a: p, b: p });
        tomar(evento, { tipo: herramienta, base, desde: p, movido: false });
        return;
      case "lapiz":
        setBorrador({ tipo: "trazo", puntos: [p], grosor: grosorTrazo, punta: puntaTrazo });
        tomar(evento, { tipo: "trazo", base, desde: p, movido: false, puntos: [p] });
        return;
      case "bloque": {
        // Cada jugador que se pulsa entra (o sale) del bloque; pulsar el césped lo termina.
        const ficha = fichaCerca(fase, p);
        const elegidas = borrador?.tipo === "bloque" ? borrador.fichas : [];
        if (ficha) {
          setBorrador({ tipo: "bloque", relleno: rellenoBloque, fichas: elegidas.includes(ficha) ? elegidas.filter((x) => x !== ficha) : [...elegidas, ficha] });
        } else if (elegidas.length) {
          cerrarBloque();
        } else {
          setAviso(t("Pulsa los jugadores del bloque uno a uno; después, el césped o Intro."));
        }
        return;
      }
      case "texto":
      case "etiqueta": {
        const id = nuevoId("a");
        guardar(agregarAnotacion(jugada, indice, { id, tipo: herramienta, a: p, texto: herramienta === "texto" ? t("Texto") : t("Etiqueta"), color: jugada.colores.anotacion }));
        setSeleccion({ tipo: "anotacion", id });
        window.setTimeout(() => textoRef.current?.select(), 30);
        return;
      }
    }
  }

  /** El resultado de soltar (o de ir arrastrando) en `p`, calculado siempre desde el cuaderno de antes. */
  function aplicarArrastre(arrastre: Arrastre, p: Punto): Jugada | null {
    const j = activaDe(arrastre.base);
    // Mover en una pose: de la segunda fase en adelante, el estudio anima la diferencia.
    if (arrastre.tipo === "ficha" && arrastre.id) return posar(j, indice, arrastre.id, alinear(j, arrastre.id, p, arrastre.libre).p);
    if (arrastre.tipo === "balon") return posarBalon(j, indice, p);
    if (arrastre.tipo === "anotacion" && arrastre.id) return desplazarAnotacion(j, indice, arrastre.id, p.x - arrastre.desde.x, p.z - arrastre.desde.z);
    if (arrastre.tipo === "pieza" && arrastre.id) {
      const antes = j.fases[indice].material?.find((m) => m.id === arrastre.id);
      if (antes) return moverMaterial(j, indice, arrastre.id, { x: antes.p.x + p.x - arrastre.desde.x, z: antes.p.z + p.z - arrastre.desde.z });
    }
    return null;
  }

  /**
   * Una ficha que se suelta cerca de la línea de un compañero (a lo largo o a
   * lo ancho) se queda a su altura o en su carril, como al ordenar una línea
   * a mano. Con Alt, donde se suelte.
   */
  function alinear(j: Jugada, id: string, p: Punto, libre = false): { p: Punto; guia: { x?: number; z?: number } | null } {
    const f = j.fases[indice], equipo = j.fichas.find((x) => x.id === id)?.equipo;
    if (libre || !f || !equipo) return { p, guia: null };
    const UMBRAL = 0.6;
    let x = p.x, z = p.z, gx: number | undefined, gz: number | undefined, dx = UMBRAL, dz = UMBRAL;
    for (const otra of j.fichas) {
      const q = otra.id !== id && otra.equipo === equipo ? f.pos[otra.id] : undefined;
      if (!q) continue;
      if (Math.abs(q.x - p.x) < dx) { dx = Math.abs(q.x - p.x); x = q.x; gx = q.x; }
      if (Math.abs(q.z - p.z) < dz) { dz = Math.abs(q.z - p.z); z = q.z; gz = q.z; }
    }
    return { p: { x, z }, guia: gx !== undefined || gz !== undefined ? { x: gx, z: gz } : null };
  }

  /** La ficha bajo `p` en la que acaba un trazo pegado (que no sea en la que empieza). */
  function fichaDeLlegada(p: Punto, desde?: string) {
    const ficha = fase ? fichaCerca(fase, p, 1.5) : null;
    return ficha && ficha !== desde ? ficha : null;
  }

  function alMover(evento: EventoDePuntero<HTMLDivElement>) {
    const arrastre = arrastreRef.current;
    if (!arrastre) return;
    const p = punto(evento);
    if (!p) return;
    if (distancia(p, arrastre.desde) > 0.3) arrastre.movido = true;
    arrastre.libre = evento.altKey;
    if (arrastre.tipo === "ficha" && arrastre.id) {
      const { guia } = alinear(activaDe(arrastre.base), arrastre.id, p, arrastre.libre);
      setBorrador(guia ? { tipo: "guia", ...guia } : null);
    }
    const siguiente = aplicarArrastre(arrastre, p);
    if (siguiente) { if (arrastre.movido) sinHistorial(siguiente); return; }
    if (arrastre.tipo === "trazo" && arrastre.puntos) {
      const ultimo = arrastre.puntos[arrastre.puntos.length - 1];
      if (distancia(ultimo, p) < 0.25 || arrastre.puntos.length > 1500) return;
      arrastre.puntos.push(p);
      const puntos = [...arrastre.puntos];
      setBorrador((actual) => (actual?.tipo === "trazo" ? { ...actual, puntos } : actual));
      return;
    }
    if (arrastre.tipo === "flecha" || arrastre.tipo === "medida") {
      const hasta = fichaDeLlegada(p, arrastre.id);
      const b = hasta && fase ? fase.pos[hasta] : p;
      setBorrador((actual) => (actual && (actual.tipo === "flecha" || actual.tipo === "medida") ? { ...actual, b, hasta: hasta ?? undefined } : actual));
      return;
    }
    setBorrador((actual) => (actual && "b" in actual ? { ...actual, b: p } : actual));
  }

  function alSoltar(evento: EventoDePuntero<HTMLDivElement>) {
    const arrastre = arrastreRef.current;
    arrastreRef.current = null;
    if (escenaRef.current) escenaRef.current.orbitar = true;
    if (!arrastre) return;
    if (evento.currentTarget.hasPointerCapture(evento.pointerId)) evento.currentTarget.releasePointerCapture(evento.pointerId);
    setBorrador(null);
    const p = punto(evento) ?? arrastre.desde;
    const j = activaDe(arrastre.base);
    const confirmar = (siguiente: Jugada) => {
      apuntar(arrastre.base);
      setCuaderno(conJugada(arrastre.base, siguiente));
    };
    const movido = arrastre.movido || distancia(p, arrastre.desde) > 0.3;
    switch (arrastre.tipo) {
      case "ficha":
      case "balon":
      case "anotacion":
      case "pieza": {
        const siguiente = aplicarArrastre(arrastre, p);
        if (movido && siguiente) confirmar(siguiente);
        return;
      }
      case "carrera":
        if (movido && arrastre.id && distancia(p, arrastre.desde) > 1) { confirmar(fijarCarrera(j, indice, arrastre.id, p)); setOrigen(null); return; }
        if (arrastre.id) {
          setOrigen(arrastre.id);
          const ficha = j.fichas.find((f) => f.id === arrastre.id);
          setAviso(tf("Ahora pulsa el destino de la ficha {n}.", { n: ficha?.dorsal ?? "" }));
        }
        return;
      case "pase":
        confirmar(fijarPase(j, indice, p, tipoPase));
        return;
      case "material": {
        const piezas = filaDeMaterial(tipoMaterial, arrastre.desde, p, separacion, slalom, colorDeMaterial);
        confirmar(agregarMaterial(j, indice, piezas));
        if (piezas.length === 1) setSeleccion({ tipo: "material", id: piezas[0].id });
        return;
      }
      case "flecha":
      case "medida": {
        const hasta = fichaDeLlegada(p, arrastre.id);
        const b = hasta ? j.fases[indice].pos[hasta] : p;
        if (distancia(b, arrastre.desde) < (arrastre.tipo === "flecha" ? 0.8 : 0.3)) return;
        const id = nuevoId("a");
        const pegada = { ...(arrastre.id ? { desde: arrastre.id } : {}), ...(hasta ? { hasta } : {}) };
        confirmar(agregarAnotacion(j, indice, arrastre.tipo === "flecha"
          ? {
            id, tipo: "flecha", a: arrastre.desde, b, color: j.colores.anotacion, estilo: estiloFlecha, ...pegada,
            ...(extremoFlecha ? { extremo: extremoFlecha } : {}), ...(grosorFlecha !== "normal" ? { grosor: grosorFlecha } : {}),
          }
          : { id, tipo: "medida", a: arrastre.desde, b, color: j.colores.anotacion, ...pegada }));
        setSeleccion({ tipo: "anotacion", id });
        return;
      }
      case "rect":
      case "zona": {
        if (distancia(p, arrastre.desde) < 0.8) return;
        const id = nuevoId("a");
        confirmar(agregarAnotacion(j, indice, { id, tipo: arrastre.tipo, a: arrastre.desde, b: p, color: j.colores.anotacion, estilo: estiloZona }));
        setSeleccion({ tipo: "anotacion", id });
        return;
      }
      case "trazo": {
        const puntos = simplificar([...(arrastre.puntos ?? []), p], 0.12);
        const largo = puntos.slice(1).reduce((suma, q, i) => suma + distancia(puntos[i], q), 0);
        if (puntos.length < 2 || largo < 0.8) return;
        const id = nuevoId("a");
        confirmar(agregarAnotacion(j, indice, {
          id, tipo: "trazo", puntos: puntos.slice(0, 600), color: j.colores.anotacion,
          ...(grosorTrazo !== "normal" ? { grosor: grosorTrazo } : {}), ...(puntaTrazo ? { punta: true } : {}),
        }));
        setSeleccion({ tipo: "anotacion", id });
        return;
      }
    }
  }

  // ---- El portal: abrir, crear, duplicar, quitar y archivos ----
  function abrir(id: string) {
    if (!cuaderno) return;
    setCuaderno({ ...cuaderno, activa: id });
    setModo("estudio");
    historial.current = [];
    futuro.current = [];
    irAFase(0, true);
  }

  function crear(nueva: Jugada) {
    if (!cuaderno) return;
    setCuaderno({ ...cuaderno, activa: nueva.id, jugadas: [...cuaderno.jugadas, nueva] });
    setModo("estudio");
    historial.current = [];
    futuro.current = [];
    irAFase(0, true);
  }

  function duplicar(id: string) {
    if (!cuaderno) return;
    const original = cuaderno.jugadas.find((j) => j.id === id);
    if (!original) return;
    const copia: Jugada = { ...structuredClone(original), id: nuevoId("j"), nombre: tf("{nombre} · copia", { nombre: original.nombre }), actualizada: Date.now() };
    setCuaderno({ ...cuaderno, jugadas: [...cuaderno.jugadas, copia] });
    if (miniaturas[id]) setMiniaturas((m) => ({ ...m, [copia.id]: m[id] }));
  }

  function quitar(id: string) {
    if (!cuaderno) return;
    const sistema = cuaderno.jugadas.find((j) => j.id === id);
    if (!sistema || !window.confirm(tf("¿Quitar «{nombre}» del estudio?", { nombre: sistema.nombre }))) return;
    const resto = cuaderno.jugadas.filter((j) => j.id !== id);
    // Sin ningún sistema el estudio no tiene qué abrir: queda uno en blanco, como al principio.
    const quedan = resto.length ? resto : cuadernoInicial().jugadas;
    setCuaderno({ ...cuaderno, activa: quedan[0].id, jugadas: quedan });
    setMiniaturas((m) => { const copia = { ...m }; delete copia[id]; return copia; });
  }

  function importar(nuevas: Jugada[]) {
    if (!cuaderno) return;
    setCuaderno({ ...cuaderno, jugadas: [...cuaderno.jugadas, ...nuevas] });
  }

  function descargarJson(datos: unknown, nombre: string) {
    descargar(URL.createObjectURL(new Blob([JSON.stringify(datos, null, 1)], { type: "application/json" })), nombre);
  }
  /** El enlace que se reproduce, copiado: se abre en cualquier navegador, sin cuenta y sin instalar nada. */
  async function copiarEnlace() {
    if (!jugada) return;
    try {
      const enlace = await enlaceDeJugada(jugada, window.location.href);
      if (enlace.length > 60000) { setAviso(t("Este sistema es demasiado grande para un enlace: mándalo como archivo (.json).")); return; }
      await navigator.clipboard.writeText(enlace);
      setAviso(t("Enlace copiado. Se abre en cualquier móvil, sin cuenta; si cambias el sistema, vuelve a copiarlo."));
    } catch {
      setAviso(t("No se pudo copiar el enlace: este navegador no deja usar el portapapeles."));
    }
  }

  function descargarSistema(id: string) {
    const sistema = cuaderno?.jugadas.find((j) => j.id === id);
    if (sistema) descargarJson(archivoDeSistema(sistema), `${archivo(sistema.nombre)}.json`);
  }
  function copiaDeTodo() {
    if (cuaderno) descargarJson(archivoDeCuaderno(cuaderno.jugadas), `estudio-tactico-${new Date().toISOString().slice(0, 10)}.json`);
  }

  function volverAlPortal() {
    setSoloVer(false);
    setReproduciendo(false);
    setSeleccion(null);
    setOrigen(null);
    setBorrador(null);
    setModo("portal");
  }

  function cambiarAmbiente(cambio: Partial<Ambiente>) {
    if (jugada) guardar({ ...jugada, ambiente: { ...jugada.ambiente, ...cambio } });
  }

  // ---- Descargar: imagen, PDF y vídeo ----

  /** La escena con el rótulo de la jugada encima, como sale en las descargas. */
  function lamina(destino: HTMLCanvasElement, indiceDeFase: number) {
    const escena = escenaRef.current;
    if (!escena || !jugada) return;
    const ctx = destino.getContext("2d")!;
    const { width: w, height: h } = destino;
    ctx.drawImage(escena.canvas, 0, 0, w, h);
    const u = h / 720;
    const sombra = ctx.createLinearGradient(0, 0, 0, 150 * u);
    sombra.addColorStop(0, "rgba(8,8,10,.78)");
    sombra.addColorStop(1, "rgba(8,8,10,0)");
    ctx.fillStyle = sombra;
    ctx.fillRect(0, 0, w, 150 * u);
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = acento;
    ctx.font = `700 ${13 * u}px ${fuente}`;
    ctx.fillText(t("ESTUDIO TÁCTICO").split("").join(String.fromCharCode(8202)), 32 * u, 40 * u);
    ctx.fillStyle = "#f5f5f7";
    ctx.font = `700 ${30 * u}px ${fuente}`;
    ctx.fillText(jugada.nombre, 32 * u, 76 * u);
    ctx.fillStyle = "rgba(245,245,247,.72)";
    ctx.font = `500 ${15 * u}px ${fuente}`;
    const f = jugada.fases[indiceDeFase];
    ctx.fillText(tf("Fase {n} de {total} · {nombre}", { n: indiceDeFase + 1, total: jugada.fases.length, nombre: deSerieEn(f.nombre) }), 32 * u, 102 * u);
    // La nota de la fase, abajo, sobre una franja oscura para que se lea en cualquier césped.
    if (f.nota.trim()) {
      const nota = deSerieEn(f.nota);
      ctx.font = `500 ${16 * u}px ${fuente}`;
      const ancho = Math.min(w - 64 * u, ctx.measureText(nota).width + 28 * u);
      ctx.fillStyle = "rgba(8,8,10,.72)";
      ctx.beginPath();
      ctx.roundRect(32 * u, h - 74 * u, ancho, 36 * u, 10 * u);
      ctx.fill();
      ctx.fillStyle = "#f5f5f7";
      ctx.fillText(nota, 46 * u, h - 50 * u, ancho - 28 * u);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(245,245,247,.6)";
    ctx.font = `600 ${12 * u}px ${fuente}`;
    ctx.fillText(firma.nombre ? `${firma.nombre} · FOS Scout Lab` : "FOS Scout Lab", w - 28 * u, h - 24 * u);
    ctx.textAlign = "left";
  }

  /** Dibuja una fase fuera del ciclo de React, para capturarla. */
  function dibujarFase(i: number, tt: number) {
    const escena = escenaRef.current;
    if (!escena || !jugada) return;
    escena.montar(jugada, i, opciones, null, null);
    montadaRef.current = i;
    escena.instante(tt);
    escena.renderizarAhora();
  }

  function descargarImagen() {
    const escena = escenaRef.current;
    if (!escena || !jugada) return;
    setReproduciendo(false);
    dibujarFase(indice, 0);
    const lienzo = document.createElement("canvas");
    lienzo.width = escena.canvas.width;
    lienzo.height = escena.canvas.height;
    lamina(lienzo, indice);
    descargar(lienzo.toDataURL("image/png"), `${archivo(jugada.nombre)}-fase-${indice + 1}.png`);
    setRemontar((n) => n + 1);
  }

  async function descargarPdf() {
    const escena = escenaRef.current;
    if (!escena || !jugada) return;
    setReproduciendo(false);
    setAviso(t("Preparando el PDF…"));
    ocupadaRef.current = true;
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const W = 297, H = 210, M = 12;
      const c = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as const;
      jugada.fases.forEach((f, i) => {
        if (i > 0) pdf.addPage();
        dibujarFase(i, 0);
        const imagen = escena.canvas.toDataURL("image/jpeg", 0.92);
        pdf.setFillColor(8, 8, 10);
        pdf.rect(0, 0, W, H, "F");
        pdf.setTextColor(...c(acento));
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        pdf.text(t("ESTUDIO TÁCTICO"), M, M + 3, { charSpace: 0.6 });
        pdf.setTextColor(245, 245, 247);
        pdf.setFontSize(18);
        pdf.text(jugada.nombre, M, M + 11);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(183, 183, 194);
        pdf.text(tf("Fase {n} de {total} · {nombre}", { n: i + 1, total: jugada.fases.length, nombre: deSerieEn(f.nombre) }), M, M + 17.5);
        const ancho = W - 2 * M;
        const alto = Math.min(H - M - 42, ancho * escena.canvas.height / escena.canvas.width);
        const anchoReal = alto * escena.canvas.width / escena.canvas.height;
        pdf.addImage(imagen, "JPEG", (W - anchoReal) / 2, M + 22, anchoReal, alto);
        if (f.nota.trim()) {
          pdf.setFontSize(10);
          pdf.setTextColor(245, 245, 247);
          pdf.text(deSerieEn(f.nota), M, M + 22 + alto + 7, { maxWidth: W - 2 * M });
        }
        pdf.setFontSize(8);
        pdf.setTextColor(133, 133, 146);
        pdf.text(firma.nombre ? `${firma.nombre} · FOS Scout Lab` : "FOS Scout Lab", M, H - 7);
        pdf.text(new Date().toLocaleDateString(idioma === "es" ? "es-CL" : "en-US"), W - M, H - 7, { align: "right" });
      });
      pdf.save(`${archivo(jugada.nombre)}.pdf`);
      setAviso("");
    } catch {
      setAviso(t("No se pudo preparar el PDF. Prueba de nuevo."));
    } finally {
      ocupadaRef.current = false;
      setRemontar((n) => n + 1);
    }
  }

  async function grabarVideo() {
    const escena = escenaRef.current;
    if (!escena || !jugada || grabando) return;
    const tipos = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mime = typeof MediaRecorder === "undefined" ? undefined : tipos.find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { setAviso(t("Este navegador no puede grabar vídeo. Prueba con Chrome o Safari actualizados.")); return; }
    setReproduciendo(false);
    setSeleccion(null);
    setGrabando(true);
    ocupadaRef.current = true;
    setAviso(t("Grabando la jugada…"));
    const lienzo = document.createElement("canvas");
    const ancho = Math.min(1920, escena.canvas.width) & ~1;
    lienzo.width = ancho;
    lienzo.height = Math.round((ancho * escena.canvas.height) / escena.canvas.width) & ~1;
    const flujo = lienzo.captureStream(30);
    const grabadora = new MediaRecorder(flujo, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const trozos: Blob[] = [];
    grabadora.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
    const terminado = new Promise<void>((resolver) => { grabadora.onstop = () => resolver(); });
    grabadora.start(250);
    // Medio segundo quieto al principio y uno al final, para que se lea el rótulo.
    const pausa = 0.6;
    const inicio = performance.now();
    escena.seguirBalon = seguir;
    await new Promise<void>((resolver) => {
      const cuadro = () => {
        const s = (performance.now() - inicio) / 1000 - pausa;
        const { fase: f, t: tt } = instanteEn(jugada, Math.max(0, s));
        if (f !== montadaRef.current) { escena.montar(jugada, f, opciones, null, null); montadaRef.current = f; }
        escena.instante(s < 0 ? 0 : tt);
        escena.renderizarAhora();
        lamina(lienzo, f);
        if (s > total + pausa) { resolver(); return; }
        requestAnimationFrame(cuadro);
      };
      montadaRef.current = -1;
      cuadro();
    });
    escena.seguirBalon = false;
    grabadora.stop();
    await terminado;
    flujo.getTracks().forEach((pista) => pista.stop());
    const extension = mime.includes("mp4") ? "mp4" : "webm";
    descargar(URL.createObjectURL(new Blob(trozos, { type: mime.split(";")[0] })), `${archivo(jugada.nombre)}.${extension}`);
    ocupadaRef.current = false;
    setGrabando(false);
    setAviso(extension === "mp4" ? "" : t("Vídeo en WebM: este navegador no graba MP4."));
    tiempoRef.current = total;
    setFaseIdx(jugada.fases.length - 1);
    setRemontar((n) => n + 1);
  }

  // ---- Lo que se ve ----
  // La barra de arriba, como en las pizarras de análisis: cada botón es una
  // herramienta y, si hace falta, el trazo o el envío con que dibuja.
  const botones: Array<{ id: string; herramienta: Herramienta; estilo?: EstiloFlecha; envio?: Pase["tipo"]; nombre: string; icono: ReactNode; ayuda: string }> = [
    { id: "mover", herramienta: "mover", nombre: t("Mover"), icono: <Mover size={16} />, ayuda: t("Arrastra una ficha, el balón, una pieza de material o una anotación. En el césped vacío, arrastra para girar la cámara.") },
    { id: "pase", herramienta: "pase", envio: "raso", nombre: t("Pase"), icono: <PaseIcono size={16} />, ayuda: t("Pulsa o arrastra hasta donde va el balón: sale desde donde está, por el suelo.") },
    { id: "elevado", herramienta: "pase", envio: "aereo", nombre: t("Elevado"), icono: <Balon size={16} />, ayuda: t("Pulsa o arrastra hasta donde cae el balón: sube con su sombra en el césped.") },
    { id: "carrera", herramienta: "carrera", nombre: t("Carrera"), icono: <Carrera size={16} />, ayuda: t("Arrastra desde una ficha hasta su destino, o pulsa la ficha y después el destino. Sale discontinua.") },
    { id: "conduccion", herramienta: "flecha", estilo: "ondulada", nombre: t("Conducción"), icono: <Conduccion size={16} />, ayuda: t("Arrastra por donde avanza con el balón pegado al pie.") },
    { id: "presion", herramienta: "flecha", estilo: "presion", nombre: t("Presión"), icono: <Presion size={16} />, ayuda: t("Arrastra desde quien presiona hacia el balón: la cuña marca el ángulo por donde llega.") },
    { id: "flecha", herramienta: "flecha", estilo: "continua", nombre: t("Flecha"), icono: <Flecha size={16} />, ayuda: t("Arrastra sobre el césped para dibujar una flecha. Si empieza o acaba en un jugador, va pegada a él.") },
    { id: "linea", herramienta: "flecha", estilo: "linea", nombre: t("Línea"), icono: <Linea size={16} />, ayuda: t("Sin punta: una altura, un límite o la línea de fuera de juego.") },
    { id: "texto", herramienta: "texto", nombre: t("Texto"), icono: <TextIcon size={16} />, ayuda: t("Pulsa el césped para escribir un texto grande, como «2 contra 2».") },
    { id: "etiqueta", herramienta: "etiqueta", nombre: t("Etiqueta"), icono: <Etiqueta size={16} />, ayuda: t("Pulsa el césped para poner una etiqueta, como «PRESIÓN» junto a un jugador.") },
    { id: "rect", herramienta: "rect", nombre: t("Zona"), icono: <Rectangulo size={16} />, ayuda: t("Arrastra sobre el césped para marcar una zona. Con «Foco», lo de fuera se apaga.") },
    { id: "zona", herramienta: "zona", nombre: t("Elipse"), icono: <Elipse size={16} />, ayuda: t("Arrastra sobre el césped para marcar una zona redonda.") },
    { id: "bloque", herramienta: "bloque", nombre: t("Bloque"), icono: <Bloque size={16} />, ayuda: t("Pulsa los jugadores de una línea o un bloque, uno a uno, y después el césped (o Intro): la línea pasa por ellos y sombrea su espacio. Va con ellos al moverse.") },
    { id: "medida", herramienta: "medida", nombre: t("Medir"), icono: <Regla size={16} />, ayuda: t("Arrastra entre dos puntos o dos jugadores para medir en metros. Si empieza o acaba en un jugador, la medida va con él.") },
    { id: "lapiz", herramienta: "lapiz", nombre: t("Lápiz"), icono: <Pencil size={16} />, ayuda: t("Dibuja a mano alzada sobre el césped.") },
  ];
  const piezas: Array<{ id: Herramienta; nombre: string; icono: ReactNode; ayuda: string }> = [
    { id: "local", nombre: t("Local"), icono: <i className="abp-ficha-icono" style={{ background: colorLocal }} />, ayuda: t("Pulsa el césped para añadir una ficha propia.") },
    { id: "rival", nombre: t("Rival"), icono: <i className="abp-ficha-icono" style={{ background: colorRival }} />, ayuda: t("Pulsa el césped para añadir una ficha rival.") },
    { id: "balon", nombre: t("Balón"), icono: <Balon size={16} />, ayuda: t("Pulsa el césped para colocar el balón al empezar la fase.") },
    { id: "material", nombre: t("Material"), icono: <Cono size={16} />, ayuda: t("Pulsa el césped para poner una pieza; arrastra para poner una fila, una cada tantos metros.") },
  ];
  const botonActivo = (b: typeof botones[number]) => herramienta === b.herramienta
    && (!b.estilo || estiloFlecha === b.estilo || (b.id === "flecha" && (estiloFlecha === "discontinua" || estiloFlecha === "punteada")))
    && (!b.envio || tipoPase === b.envio);
  function elegir(b: { herramienta: Herramienta; estilo?: EstiloFlecha; envio?: Pase["tipo"] }) {
    setHerramienta(b.herramienta);
    if (b.estilo) setEstiloFlecha(b.estilo);
    if (b.envio) setTipoPase(b.envio);
    setOrigen(null);
    setBorrador(null);
    setAviso("");
  }
  const ayuda = botones.find(botonActivo)?.ayuda ?? piezas.find((p) => p.id === herramienta)?.ayuda ?? "";
  const fichaElegida = jugada && seleccion?.tipo === "ficha" ? jugada.fichas.find((f) => f.id === seleccion.id) ?? null : null;
  const carreraElegida = fichaElegida && fase ? carreraDe(fase, fichaElegida.id) : undefined;
  const anotacionElegida = fase && seleccion?.tipo === "anotacion" ? fase.anotaciones.find((a) => a.id === seleccion.id) ?? null : null;
  const ocultas = jugada?.ambiente.ocultas ?? [];
  const capas: Array<{ capas: Capa[]; nombre: string }> = [
    { capas: ["recorridos"], nombre: t("Carreras y envíos") },
    { capas: ["flechas"], nombre: t("Flechas y trazos") },
    { capas: ["zonas"], nombre: t("Zonas y bloques") },
    { capas: ["medidas"], nombre: t("Medidas") },
    { capas: ["textos"], nombre: t("Textos y etiquetas") },
  ];
  const nombreDeAnotacion: Record<Anotacion["tipo"], string> = {
    flecha: t("Flecha"), rect: t("Zona"), zona: t("Elipse"), texto: t("Texto"), etiqueta: t("Etiqueta"), medida: t("Medida"), bloque: t("Bloque"), trazo: t("Trazo"),
  };
  const dorsalDe = (id?: string) => (id ? jugada?.fichas.find((f) => f.id === id)?.dorsal ?? "?" : "");
  const materialElegido = fase && seleccion?.tipo === "material" ? fase.material?.find((m) => m.id === seleccion.id) ?? null : null;
  // Cambiar la equipación: de una vez con un botón, poco a poco con el selector de color.
  const vestir = (equipo: Equipo) => (cambios: Partial<Equipacion>, conHistorial: boolean) => {
    if (!jugada) return;
    const siguiente = cambiarEquipacion(jugada, equipo, cambios);
    if (conHistorial) guardar(siguiente); else sinHistorial(siguiente);
  };
  const vistas: Array<{ id: Vista; nombre: string }> = [
    { id: "tactica", nombre: t("Táctica") },
    { id: "3d", nombre: t("3D") },
    { id: "cenital", nombre: t("Cenital") },
  ];
  const nombreDeFase = (f: Fase, i: number) => (/^(fase|phase) \d+$/i.test(f.nombre.trim()) ? "" : deSerieEn(f.nombre)) || tf("Fase {n}", { n: i + 1 });

  function acercar(factor: number) {
    const nuevo = escenaRef.current?.acercar?.(factor);
    if (nuevo) setZoom(nuevo);
  }
  function pantallaCompleta() {
    const caja = contenedorRef.current;
    if (!caja) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void caja.requestFullscreen?.().catch(() => setAviso(t("Este navegador no deja poner el campo a pantalla completa.")));
  }

  return <div className={claseHoja}>
    <section className="estilo-page abp-page" ref={raizRef}>
      <header className={`abp-cabecera${modo === "estudio" ? " compacta" : ""}`}>
        <div>
          <span>{t("PIZARRA · 2D Y 3D")}</span>
          <h2>{modo === "estudio" && jugada ? jugada.nombre : modo === "biblioteca" ? t("Biblioteca") : t("Tus sistemas")}</h2>
          {modo === "portal" && <p>{t("Cada sistema que construyas —salida, presión, ataque, balón parado o un ejercicio—, listo para abrir, duplicar o descargar. Se guarda en este navegador.")}</p>}
          {modo === "biblioteca" && <p>{t("Sistemas ya dibujados, por temas: cada uno contesta una pregunta. Ábrelo para verlo moverse y úsalo de base.")}</p>}
          {modo !== "estudio" && aviso && <p className="abp-compartido" role="status">{aviso}</p>}
          {modo === "estudio" && soloVer && <p className="abp-compartido">{t("Te lo han enviado con un enlace. Pulsa Reproducir para verlo; se guardó una copia en «Tus sistemas».")}
            <button type="button" className="button secondary compact" onClick={() => setSoloVer(false)}>{t("Editar mi copia")}</button></p>}
        </div>
        <div className="abp-cabecera-acciones">
          {modo !== "estudio" && <div className="inspector-segmentos abp-modos" role="tablist" aria-label={t("Pizarra")}>
            <button type="button" role="tab" aria-selected={modo === "portal"} className={modo === "portal" ? "activa" : ""} onClick={() => setModo("portal")}>{t("Tus sistemas")}</button>
            <button type="button" role="tab" aria-selected={modo === "biblioteca"} className={modo === "biblioteca" ? "activa" : ""} onClick={() => setModo("biblioteca")}>{t("Biblioteca")}</button>
          </div>}
          {modo === "estudio" && <button type="button" className="button secondary compact" onClick={volverAlPortal}><ChevronLeft size={14} />{t("Tus sistemas")}</button>}
          {onVolver && <button type="button" className="button secondary compact" onClick={onVolver}>{t("Volver al inicio")}</button>}
        </div>
      </header>

      {modo === "biblioteca" && cuaderno && <Biblioteca idioma={idioma} opciones={opciones} onAbrir={crear} />}

      {modo === "portal" && cuaderno && <Portal jugadas={cuaderno.jugadas} miniaturas={miniaturas} idioma={idioma}
        onAbrir={abrir} onCrear={crear} onDuplicar={duplicar} onQuitar={quitar} onImportar={importar} onDescargar={descargarSistema} onCopiaDeTodo={copiaDeTodo} />}

      <div className={`abp-grid abp-estudio${soloVer ? " abp-ver" : ""}`} hidden={modo !== "estudio"}>
        <div className="abp-barra">
          <div className="abp-herramientas" role="toolbar" aria-label={t("Herramientas")}>
            {botones.map((b) => <button key={b.id} type="button" className={botonActivo(b) ? "activa" : ""} aria-pressed={botonActivo(b)} title={b.ayuda} onClick={() => elegir(b)}>
              {b.icono}<span>{b.nombre}</span>
            </button>)}
            <i className="abp-separador" aria-hidden="true" />
            {piezas.map((p) => <button key={p.id} type="button" className={herramienta === p.id ? "activa" : ""} aria-pressed={herramienta === p.id} title={p.ayuda} onClick={() => elegir({ herramienta: p.id })}>
              {p.icono}<span>{p.nombre}</span>
            </button>)}
          </div>
          <div className="abp-barra-acciones">
            <button type="button" className="button secondary compact" onClick={deshacer} title={t("Deshacer (Ctrl+Z)")}><RotateCcw size={13} />{t("Deshacer")}</button>
            <button type="button" className="button secondary compact abp-solo-icono" onClick={rehacer} title={t("Rehacer (Ctrl+Mayús+Z)")} aria-label={t("Rehacer")}><RotateCw size={13} /></button>
            <button type="button" className="button secondary compact abp-solo-icono" onClick={() => setAtajos((a) => !a)} title={t("Atajos de teclado (?)")} aria-label={t("Atajos de teclado")} aria-expanded={atajos}><Teclado size={14} /></button>
            <button type="button" className="button primary compact abp-play" onClick={alternarReproduccion} disabled={grabando}>
              {reproduciendo ? <><Pause size={13} />{t("Detener")}</> : <><Play size={13} />{t("Reproducir")}</>}
            </button>
            <details className="abp-exportar">
              <summary className="button secondary compact"><ArrowDownToLine size={13} />{t("Exportar")}</summary>
              <div className="abp-menu" role="menu">
                <button type="button" role="menuitem" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); descargarImagen(); }} disabled={!lista || grabando}>{t("Imagen PNG de esta fase")}</button>
                <button type="button" role="menuitem" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); void descargarPdf(); }} disabled={!lista || grabando}>{t("PDF con una fase por página")}</button>
                <button type="button" role="menuitem" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); void grabarVideo(); }} disabled={!lista || grabando}><Video size={13} />{grabando ? t("Grabando…") : t("Vídeo de la jugada")}</button>
                <button type="button" role="menuitem" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); void copiarEnlace(); }}>{t("Copiar el enlace que se reproduce")}</button>
                <button type="button" role="menuitem" onClick={(e) => { e.currentTarget.closest("details")?.removeAttribute("open"); if (jugada) descargarSistema(jugada.id); }}>{t("Archivo del sistema (.json)")}</button>
              </div>
            </details>
          </div>
        </div>

        <aside className="designer-controls inspector abp-inspector abp-izquierda">
          {jugada && cuaderno && <>
            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("El tablero")}</h3>
              <div className="inspector-tarjeta">
                <label className="inspector-fila"><span>{t("Vista del campo")}</span>
                  <select className="inspector-selector" value={jugada.ambiente.encuadre} onChange={(e) => cambiarAmbiente({ encuadre: e.target.value as Ambiente["encuadre"] })}>
                    {ENCUADRES.map((x) => <option key={x.id} value={x.id}>{deSerieEn(x.nombre)}</option>)}
                  </select>
                </label>
                <div className="inspector-fila"><span>{t("Campo")}</span>
                  <div className="inspector-segmentos">
                    <button type="button" className={orientacion === "horizontal" ? "activa" : ""} onClick={() => cambiarAmbiente({ orientacion: "horizontal" })}>{t("Horizontal")}</button>
                    <button type="button" className={orientacion === "vertical" ? "activa" : ""} onClick={() => cambiarAmbiente({ orientacion: "vertical" })}>{t("Vertical")}</button>
                  </div>
                </div>
                <label className="inspector-fila"><span>{t("Césped")}</span>
                  <select className="inspector-selector" value={jugada.ambiente.superficie} onChange={(e) => cambiarAmbiente({ superficie: e.target.value as Ambiente["superficie"] })}>
                    {SUPERFICIES.map((x) => <option key={x.id} value={x.id}>{deSerieEn(x.nombre)}</option>)}
                  </select>
                </label>
                <label className="inspector-fila"><span>{t("Marcas")}</span>
                  <select className="inspector-selector" value={jugada.ambiente.zonas} onChange={(e) => cambiarAmbiente({ zonas: e.target.value as Ambiente["zonas"] })}>
                    {ZONAS.map((x) => <option key={x.id} value={x.id}>{deSerieEn(x.nombre)}</option>)}
                  </select>
                </label>
                <div className="inspector-fila"><span>{t("Cámara tras el balón")}</span><Interruptor activo={seguir} onCambio={setSeguir} titulo={t("Cámara tras el balón")} /></div>
                {jugada.ambiente.dimension === "3d" && <div className="inspector-fila"><span>{t("Estadio")}</span><Interruptor activo={jugada.ambiente.estadio} onCambio={(estadio) => cambiarAmbiente({ estadio })} titulo={t("Estadio")} /></div>}
              </div>
            </section>

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Qué se ve")}</h3>
              <div className="inspector-tarjeta">
                {capas.map((c) => <div key={c.nombre} className="inspector-fila"><span>{c.nombre}</span>
                  <Interruptor activo={!c.capas.some((x) => ocultas.includes(x))} onCambio={(ver) => alternarCapa(c.capas, ver)} titulo={c.nombre} />
                </div>)}
              </div>
              <p className="inspector-pie">{t("Lo oculto no se borra: tampoco sale en la imagen, el PDF ni el vídeo. H oculta o enseña las flechas.")}</p>
            </section>

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Equipos")}</h3>
              <div className="inspector-tarjeta">
                <label className="inspector-fila"><span>{t("Nuestro color")}</span>
                  {jugada.colores.local && <button type="button" className="abp-enlace" onClick={() => guardar({ ...jugada, colores: { ...jugada.colores, local: null } })}>{t("Del espacio")}</button>}
                  <input type="color" value={colorLocal} onFocus={marcarHistorial} onChange={(e) => sinHistorial({ ...jugada, colores: { ...jugada.colores, local: e.target.value } })} />
                </label>
                <label className="inspector-fila"><span>{t("Su color")}</span>
                  <input type="color" value={colorRival} onFocus={marcarHistorial} onChange={(e) => sinHistorial({ ...jugada, colores: { ...jugada.colores, rival: e.target.value } })} />
                </label>
                <label className="inspector-fila"><span>{t("Anotaciones")}</span>
                  <input type="color" value={colorAnotacion} onFocus={marcarHistorial} onChange={(e) => sinHistorial({ ...jugada, colores: { ...jugada.colores, anotacion: e.target.value } })} />
                </label>
                <div className="inspector-fila"><span>{t("Dentro de la ficha")}</span>
                  <div className="inspector-segmentos">
                    <button type="button" className={jugada.ambiente.fichas === "dorsal" ? "activa" : ""} onClick={() => cambiarAmbiente({ fichas: "dorsal" })}>{t("Dorsal")}</button>
                    <button type="button" className={jugada.ambiente.fichas === "puesto" ? "activa" : ""} onClick={() => cambiarAmbiente({ fichas: "puesto" })}>{t("Puesto")}</button>
                  </div>
                </div>
                <div className="inspector-fila"><span>{t("Nombres de los roles")}</span><Interruptor activo={nombres} onCambio={setNombres} titulo={t("Nombres de los roles")} /></div>
              </div>
            </section>

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Equipaciones")}</h3>
              <EditorDeEquipacion titulo={t("Nuestra camiseta")} base={colorLocal} equipacion={equipacionDe(jugada, "local")} nombre={deSerieEn}
                onCambio={vestir("local")} onEmpezar={marcarHistorial} />
              <EditorDeEquipacion titulo={t("La suya")} base={colorRival} equipacion={equipacionDe(jugada, "rival")} nombre={deSerieEn}
                onCambio={vestir("rival")} onEmpezar={marcarHistorial} />
            </section>

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Sistema")}<small>{tf(jugada.fases.length === 1 ? "{n} fase" : "{n} fases", { n: jugada.fases.length })}</small></h3>
              <div className="inspector-tarjeta">
                <label className="inspector-fila"><span>{t("Nombre")}</span>
                  <input className="abp-campo" value={jugada.nombre} maxLength={80} onFocus={marcarHistorial} onChange={(e) => sinHistorial({ ...jugada, nombre: e.target.value })} />
                </label>
                <label className="inspector-fila"><span>{t("Categoría")}</span>
                  <select className="inspector-selector" value={jugada.categoria} onChange={(e) => guardar({ ...jugada, categoria: e.target.value as Categoria })}>
                    {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{deSerieEn(c.nombre)}</option>)}
                  </select>
                </label>
                <div className="inspector-fila"><span>{t("Movimiento")}</span>
                  <div className="inspector-segmentos">
                    <button type="button" className={jugada.ambiente.suavizado === "suave" ? "activa" : ""} onClick={() => cambiarAmbiente({ suavizado: "suave" })}>{t("Suave")}</button>
                    <button type="button" className={jugada.ambiente.suavizado === "lineal" ? "activa" : ""} onClick={() => cambiarAmbiente({ suavizado: "lineal" })}>{t("Lineal")}</button>
                  </div>
                </div>
                <div className="inspector-fila"><span>{t("Estelas")}</span><Interruptor activo={jugada.ambiente.estelas} onCambio={(estelas) => cambiarAmbiente({ estelas })} titulo={t("Estelas")} /></div>
              </div>
              <p className="inspector-pie">{t("Atajos: espacio reproduce, N añade una fase, [ y ] cambian de fase, Supr borra, Ctrl+Z deshace.")}</p>
            </section>
          </>}
          <datalist id="abp-roles">{ROLES.map((rol) => <option key={rol} value={deSerieEn(rol)} />)}</datalist>
        </aside>

        <div className="abp-principal">
          <div className={`abp-escenario herramienta-${herramienta}`} ref={contenedorRef} data-orientacion={dimension === "2d" ? orientacion : "horizontal"}
            onPointerDownCapture={alPulsar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}>
            {!lista && !error && <p className="abp-cargando">{dimension === "3d" ? t("Preparando el estadio 3D…") : t("Preparando el tablero…")}</p>}
            {error && <p className="abp-cargando">{error}</p>}
            <div className="abp-flotante abp-vistas" role="group" aria-label={t("Vistas de cámara")}>
              {/* El tablero plano o el estadio: la misma jugada, dos maneras de verla. */}
              {jugada && <div className="inspector-segmentos abp-dimension">
                <button type="button" className={dimension === "2d" ? "activa" : ""} onClick={() => cambiarAmbiente({ dimension: "2d" })}>{t("2D")}</button>
                <button type="button" className={dimension === "3d" ? "activa" : ""} onClick={() => cambiarAmbiente({ dimension: "3d" })}>{t("3D")}</button>
              </div>}
              {dimension === "3d" && <div className="inspector-segmentos">
                {vistas.map((v) => <button key={v.id} type="button" className={vista === v.id ? "activa" : ""} onClick={() => { setVista(v.id); escenaRef.current?.vista(v.id, encuadre, fase ? centroDe(fase) : null); }}>{v.nombre}</button>)}
              </div>}
            </div>
            {atajos && <Atajos onCerrar={() => setAtajos(false)} />}
            <div className="abp-flotante abp-zoom" role="group" aria-label={t("Zoom")}>
              <button type="button" className="abp-boton-flotante" onClick={() => fase && escenaRef.current?.centrar(puntosDe(fase))} title={t("Encuadrar la jugada de esta fase")}><Cubo size={14} />{t("Centrar")}</button>
              {dimension === "2d" && <>
                <i className="abp-separador" aria-hidden="true" />
                <button type="button" className="abp-boton-flotante" onClick={() => acercar(1 / 1.25)} aria-label={t("Alejar")}>−</button>
                <button type="button" className="abp-boton-flotante abp-zoom-valor" onClick={() => { escenaRef.current?.vista(vista, encuadre, null); setZoom(100); }} title={t("Volver al encuadre")}>{zoom}%</button>
                <button type="button" className="abp-boton-flotante" onClick={() => acercar(1.25)} aria-label={t("Acercar")}>+</button>
              </>}
              <i className="abp-separador" aria-hidden="true" />
              <button type="button" className="abp-boton-flotante" onClick={pantallaCompleta} aria-label={t("Pantalla completa")} title={t("Pantalla completa")}><PantallaCompleta size={14} /></button>
            </div>
            {(aviso || origen) && <p className="abp-flotante abp-aviso" role="status">{aviso}</p>}
          </div>

          {jugada && fase && <div className="abp-pie">
            <p className="abp-pie-fase" aria-live="polite">
              <b>{tf("Fase {n} de {total}", { n: indice + 1, total: jugada.fases.length })}{nombreDeFase(fase, indice) && <>: {nombreDeFase(fase, indice)}.</>}</b>
              {fase.nota.trim() && <span> {deSerieEn(fase.nota)}</span>}
            </p>
            <input ref={barraRef} className="abp-progreso" type="range" min={0} max={total} step={0.01} defaultValue={0} aria-label={t("Progreso de la jugada")}
              onChange={(e) => {
                setReproduciendo(false);
                tiempoRef.current = Number(e.target.value);
                const ahora = instanteEn(jugada, tiempoRef.current);
                if (ahora.fase !== indice) setFaseIdx(ahora.fase);
                else escenaRef.current?.instante(ahora.t);
              }} />
          </div>}
        </div>

        <aside className="designer-controls inspector abp-inspector abp-derecha">
          {jugada && fase && <>
            {fichaElegida && <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Ficha")}<small>{fichaElegida.equipo === "local" ? t("Local") : t("Rival")}</small></h3>
              <div className="inspector-tarjeta">
                <label className="inspector-fila"><span>{t("Dorsal")}</span>
                  <input className="abp-campo corto" value={fichaElegida.dorsal} maxLength={3} onFocus={marcarHistorial} onChange={(e) => sinHistorial(cambiarFicha(jugada, fichaElegida.id, { dorsal: e.target.value }))} />
                </label>
                <label className="inspector-fila"><span>{t("Rol")}</span>
                  <input className="abp-campo" list="abp-roles" value={deSerieEn(fichaElegida.rol)} maxLength={24} placeholder={t("Sin rol")} onFocus={marcarHistorial}
                    onChange={(e) => sinHistorial(cambiarFicha(jugada, fichaElegida.id, { rol: e.target.value }))} />
                </label>
                <div className="inspector-fila"><span>{t("Equipo")}</span>
                  <div className="inspector-segmentos">
                    <button type="button" className={fichaElegida.equipo === "local" ? "activa" : ""} onClick={() => guardar(cambiarFicha(jugada, fichaElegida.id, { equipo: "local" }))}>{t("Local")}</button>
                    <button type="button" className={fichaElegida.equipo === "rival" ? "activa" : ""} onClick={() => guardar(cambiarFicha(jugada, fichaElegida.id, { equipo: "rival" }))}>{t("Rival")}</button>
                  </div>
                </div>
                {carreraElegida && <label className="inspector-fila inspector-deslizador"><span>{t("Curva de la carrera")}</span><b>{carreraElegida.curva.toFixed(0)} m</b>
                  <input type="range" min={-12} max={12} step={0.5} value={carreraElegida.curva} onPointerDown={marcarHistorial}
                    onChange={(e) => sinHistorial(curvarCarrera(jugada, indice, fichaElegida.id, Number(e.target.value)))} />
                </label>}
                <div className="inspector-fila abp-acciones">
                  {carreraElegida && <button type="button" onClick={() => guardar(quitarCarrera(jugada, indice, fichaElegida.id))}>{t("Quitar carrera")}</button>}
                  <button type="button" className="peligro" onClick={borrarSeleccion}><Trash size={14} />{t("Quitar ficha")}</button>
                </div>
              </div>
            </section>}

            {anotacionElegida && <section className="inspector-grupo">
              <h3 className="inspector-titulo">{nombreDeAnotacion[anotacionElegida.tipo]}
                {anotacionElegida.tipo === "medida" && <small>{opciones.metros!(distancia(extremosDe(anotacionElegida, fase, 0).a, extremosDe(anotacionElegida, fase, 0).b))}</small>}
                {anotacionElegida.tipo === "bloque" && <small>{tf(anotacionElegida.fichas.length === 1 ? "{n} jugador" : "{n} jugadores", { n: anotacionElegida.fichas.length })}</small>}
              </h3>
              <div className="inspector-tarjeta">
                {(anotacionElegida.tipo === "texto" || anotacionElegida.tipo === "etiqueta") && <label className="inspector-fila"><span>{t("Texto")}</span>
                  <input ref={textoRef} className="abp-campo" value={anotacionElegida.texto} maxLength={80} onFocus={marcarHistorial}
                    onChange={(e) => sinHistorial(cambiarAnotacion(jugada, indice, anotacionElegida.id, { texto: e.target.value }))} />
                </label>}
                <label className="inspector-fila"><span>{t("Color")}</span>
                  <input type="color" value={anotacionElegida.color} onFocus={marcarHistorial} onChange={(e) => sinHistorial(cambiarAnotacion(jugada, indice, anotacionElegida.id, { color: e.target.value }))} />
                </label>
                {anotacionElegida.tipo === "flecha" && <>
                  <div className="inspector-fila abp-fila-segmentos"><span>{t("Trazo")}</span>
                    <SegmentosFlecha valor={anotacionElegida.estilo} onCambio={(estilo) => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { estiloFlecha: estilo }))} />
                  </div>
                  {anotacionElegida.estilo !== "presion" && <>
                    <div className="inspector-fila"><span>{t("Final")}</span>
                      <SegmentosExtremo valor={anotacionElegida.extremo ?? (anotacionElegida.estilo === "linea" ? "nada" : "punta")} onCambio={(extremo) => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { extremo }))} />
                    </div>
                    <div className="inspector-fila"><span>{t("Grosor")}</span>
                      <SegmentosGrosor valor={anotacionElegida.grosor ?? "normal"} onCambio={(grosor) => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { grosor }))} />
                    </div>
                    <label className="inspector-fila inspector-deslizador"><span>{t("Curva")}</span><b>{(anotacionElegida.curva ?? 0).toFixed(0)} m</b>
                      <input type="range" min={-15} max={15} step={0.5} value={anotacionElegida.curva ?? 0} onPointerDown={marcarHistorial}
                        onChange={(e) => sinHistorial(cambiarAnotacion(jugada, indice, anotacionElegida.id, { curva: Number(e.target.value) }))} />
                    </label>
                  </>}
                </>}
                {(anotacionElegida.tipo === "flecha" || anotacionElegida.tipo === "medida") && (anotacionElegida.desde || anotacionElegida.hasta) && <div className="inspector-fila">
                  <span>{anotacionElegida.desde && anotacionElegida.hasta
                    ? tf("Pegada al {a} y al {b}", { a: dorsalDe(anotacionElegida.desde), b: dorsalDe(anotacionElegida.hasta) })
                    : tf("Pegada al {a}", { a: dorsalDe(anotacionElegida.desde ?? anotacionElegida.hasta) })}</span>
                  <button type="button" className="abp-enlace" onClick={() => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { soltar: true }))}>{t("Despegar")}</button>
                </div>}
                {anotacionElegida.tipo === "bloque" && <div className="inspector-fila"><span>{t("Sombra")}</span>
                  <SegmentosRelleno valor={anotacionElegida.relleno} onCambio={(relleno) => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { relleno }))} />
                </div>}
                {anotacionElegida.tipo === "trazo" && <>
                  <div className="inspector-fila"><span>{t("Grosor")}</span>
                    <SegmentosGrosor valor={anotacionElegida.grosor ?? "normal"} onCambio={(grosor) => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { grosor }))} />
                  </div>
                  <div className="inspector-fila"><span>{t("Con punta")}</span>
                    <Interruptor activo={anotacionElegida.punta === true} onCambio={(punta) => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { punta }))} titulo={t("Con punta")} />
                  </div>
                </>}
                {(anotacionElegida.tipo === "rect" || anotacionElegida.tipo === "zona") && <div className="inspector-fila"><span>{t("Relleno")}</span>
                  <SegmentosEstilo valor={anotacionElegida.estilo} onCambio={(estilo) => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { estilo }))} />
                </div>}
                <div className="inspector-fila abp-acciones">
                  {anotacionElegida.tipo !== "bloque" && <button type="button" onClick={() => { if (copiar()) pegar(); }} title={t("Duplicar (Ctrl+D)")}><Duplicar size={13} />{t("Duplicar")}</button>}
                  <button type="button" className="peligro" onClick={borrarSeleccion}><Trash size={14} />{t("Quitar anotación")}</button>
                </div>
              </div>
            </section>}

            {materialElegido && <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Material")}<small>{deSerieEn(datosDeMaterial(materialElegido.tipo).nombre)}</small></h3>
              <div className="inspector-tarjeta">
                <SelectorDeMaterial valor={materialElegido.tipo} color={materialElegido.color} nombre={deSerieEn} onCambio={(tipo) => {
                  // Si llevaba el color de serie, toma el de la pieza nueva; si se lo cambiaste, lo conserva.
                  const deFabrica = materialElegido.color === datosDeMaterial(materialElegido.tipo).color;
                  guardar(cambiarMaterial(jugada, indice, materialElegido.id, { tipo, ...(deFabrica ? { color: datosDeMaterial(tipo).color } : {}) }));
                }} />
                <label className="inspector-fila"><span>{t("Color")}</span>
                  <input type="color" value={materialElegido.color} onFocus={marcarHistorial} onChange={(e) => sinHistorial(cambiarMaterial(jugada, indice, materialElegido.id, { color: e.target.value }))} />
                </label>
                <label className="inspector-fila inspector-deslizador"><span>{t("Giro")}</span><b>{materialElegido.giro}°</b>
                  <input type="range" min={0} max={355} step={5} value={materialElegido.giro} onPointerDown={marcarHistorial}
                    onChange={(e) => sinHistorial(cambiarMaterial(jugada, indice, materialElegido.id, { giro: Number(e.target.value) }))} />
                </label>
                <div className="inspector-fila abp-acciones">
                  <button type="button" className="peligro" onClick={borrarSeleccion}><Trash size={14} />{t("Quitar pieza")}</button>
                </div>
              </div>
            </section>}

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Fase")}<small>{tf("{n} de {total}", { n: indice + 1, total: jugada.fases.length })}</small></h3>
              <div className="inspector-tarjeta">
                <label className="inspector-fila"><span>{t("Título")}</span>
                  <input className="abp-campo" value={deSerieEn(fase.nombre)} maxLength={40} onFocus={marcarHistorial} onChange={(e) => sinHistorial(renombrarFase(jugada, indice, e.target.value))} />
                </label>
                <label className="inspector-fila abp-fila-nota"><span>{t("Nota")}</span>
                  <textarea className="abp-nota" value={deSerieEn(fase.nota)} maxLength={160} rows={2} placeholder={t("Una línea que se lea de un vistazo")} onFocus={marcarHistorial}
                    onChange={(e) => sinHistorial({ ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? { ...f, nota: e.target.value } : f)) })} />
                </label>
              </div>
            </section>

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Tiempos de esta fase")}</h3>
              <div className="inspector-tarjeta">
                <label className="inspector-fila inspector-deslizador"><span>{t("Pausa en la pose")}</span><b>{fase.pausa.toFixed(1)} s</b>
                  <input type="range" min={0} max={6} step={0.1} value={fase.pausa} onPointerDown={marcarHistorial} onChange={(e) => sinHistorial(cambiarPausa(jugada, indice, Number(e.target.value)))} />
                </label>
                <label className="inspector-fila inspector-deslizador"><span>{t("Movimiento a la siguiente")}</span><b>{fase.duracion.toFixed(1)} s</b>
                  <input type="range" min={0.2} max={6} step={0.1} value={fase.duracion} onPointerDown={marcarHistorial} onChange={(e) => sinHistorial(cambiarDuracion(jugada, indice, Number(e.target.value)))} />
                </label>
                {fase.pase && <div className="inspector-fila"><span>{t("Envío")}</span>
                  <div className="inspector-segmentos">
                    <button type="button" className={fase.pase.tipo === "aereo" ? "activa" : ""} onClick={() => guardar(tipoDePase(jugada, indice, "aereo"))}>{t("Aéreo")}</button>
                    <button type="button" className={fase.pase.tipo === "raso" ? "activa" : ""} onClick={() => guardar(tipoDePase(jugada, indice, "raso"))}>{t("Raso")}</button>
                  </div>
                </div>}
                {fase.pase && <div className="inspector-fila abp-acciones"><button type="button" onClick={() => guardar(quitarPase(jugada, indice))}>{t("Quitar envío")}</button></div>}
              </div>
              <p className="inspector-pie">{t("De la segunda fase en adelante, mueve las fichas a su nueva posición: el estudio anima la diferencia desde la fase anterior.")}</p>
            </section>

            <PanelDeMedidas jugada={jugada} fase={fase} idioma={idioma} colores={{ local: colorLocal, rival: colorRival }} metros={opciones.metros!}
              onDibujar={(nuevas) => guardar(nuevas.reduce((j, a) => agregarAnotacion(j, indice, a), jugada))} />

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Herramienta")}</h3>
              {herramienta === "flecha" && <div className="inspector-tarjeta abp-tarjeta-extra">
                <div className="inspector-fila abp-fila-segmentos"><span>{t("Trazo")}</span><SegmentosFlecha valor={estiloFlecha} onCambio={setEstiloFlecha} /></div>
                {estiloFlecha !== "presion" && <>
                  <div className="inspector-fila"><span>{t("Final")}</span>
                    <SegmentosExtremo valor={extremoFlecha ?? (estiloFlecha === "linea" ? "nada" : "punta")} onCambio={setExtremoFlecha} />
                  </div>
                  <div className="inspector-fila"><span>{t("Grosor")}</span><SegmentosGrosor valor={grosorFlecha} onCambio={setGrosorFlecha} /></div>
                </>}
              </div>}
              {herramienta === "lapiz" && <div className="inspector-tarjeta abp-tarjeta-extra">
                <div className="inspector-fila"><span>{t("Grosor")}</span><SegmentosGrosor valor={grosorTrazo} onCambio={setGrosorTrazo} /></div>
                <div className="inspector-fila"><span>{t("Con punta")}</span><Interruptor activo={puntaTrazo} onCambio={setPuntaTrazo} titulo={t("Con punta")} /></div>
              </div>}
              {herramienta === "bloque" && <div className="inspector-tarjeta abp-tarjeta-extra">
                <div className="inspector-fila"><span>{t("Sombra")}</span>
                  <SegmentosRelleno valor={rellenoBloque} onCambio={(relleno) => { setRellenoBloque(relleno); setBorrador((b) => (b?.tipo === "bloque" ? { ...b, relleno } : b)); }} />
                </div>
                <div className="inspector-fila"><span>{tf("Elegidos: {n}", { n: borrador?.tipo === "bloque" ? borrador.fichas.length : 0 })}</span>
                  <button type="button" className="abp-enlace" disabled={borrador?.tipo !== "bloque" || !borrador.fichas.length} onClick={cerrarBloque}>{t("Crear bloque")}</button>
                </div>
              </div>}
              {(herramienta === "rect" || herramienta === "zona") && <div className="inspector-tarjeta abp-tarjeta-extra">
                <div className="inspector-fila"><span>{t("Relleno")}</span>
                  <SegmentosEstilo valor={estiloZona} onCambio={setEstiloZona} />
                </div>
              </div>}
              {herramienta === "material" && <div className="inspector-tarjeta abp-tarjeta-extra">
                <SelectorDeMaterial valor={tipoMaterial} color={colorDeMaterial} nombre={deSerieEn} onCambio={(tipo) => { setTipoMaterial(tipo); setColorMaterial(null); }} />
                <label className="inspector-fila"><span>{t("Color")}</span>
                  {colorMaterial && <button type="button" className="abp-enlace" onClick={() => setColorMaterial(null)}>{t("El de serie")}</button>}
                  <input type="color" value={colorDeMaterial} onChange={(e) => setColorMaterial(e.target.value)} />
                </label>
                <label className="inspector-fila inspector-deslizador"><span>{t("Separación en la fila")}</span><b>{separacion.toFixed(1)} m</b>
                  <input type="range" min={0.5} max={10} step={0.5} value={separacion} onChange={(e) => setSeparacion(Number(e.target.value))} />
                </label>
                <div className="inspector-fila"><span>{t("Slalom")}</span><Interruptor activo={slalom} onCambio={setSlalom} titulo={t("Slalom")} /></div>
              </div>}
              <p className="inspector-pie">{ayuda}</p>
            </section>
          </>}
        </aside>

        {jugada && fase && <div className="abp-tira">
          <div className="abp-miniaturas" role="tablist" aria-label={t("Fases de la jugada")}>
            {jugada.fases.map((f, i) => <button key={f.id} type="button" role="tab" aria-selected={i === indice} className={i === indice ? "activa" : ""} onClick={() => irAFase(i)}
              title={nombreDeFase(f, i)} data-orientacion={orientacion}>
              {/* Una foto del lienzo en data:, nada que optimizar con next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {fotosDeFases[i] ? <img src={fotosDeFases[i]} alt="" /> : <span className="abp-miniatura-vacia" />}
              <b>{i + 1}</b>
            </button>)}
            <button type="button" className="abp-miniatura-nueva" data-orientacion={orientacion} onClick={() => { guardar(agregarFase(jugada, indice, tf("Fase {n}", { n: jugada.fases.length + 1 }))); irAFase(indice + 1); }}
              title={t("Añadir una fase después de esta (N)")}><Plus size={16} /><span>{t("Fase")}</span></button>
          </div>
          <div className="abp-tira-acciones">
            <span className="abp-tira-fase">{tf("Fase {n}", { n: indice + 1 })}</span>
            <button type="button" disabled={indice === 0} onClick={() => { guardar(moverFase(jugada, indice, -1)); irAFase(indice - 1); }}><ChevronLeft size={13} />{t("Antes")}</button>
            <button type="button" disabled={indice === jugada.fases.length - 1} onClick={() => { guardar(moverFase(jugada, indice, 1)); irAFase(indice + 1); }}>{t("Después")}<ChevronRight size={13} /></button>
            <button type="button" onClick={() => { guardar(duplicarFase(jugada, indice, tf("{nombre} · copia", { nombre: deSerieEn(fase.nombre) }))); irAFase(indice + 1); }}><Duplicar size={13} />{t("Duplicar")}</button>
            <button type="button" className="peligro" disabled={jugada.fases.length < 2} onClick={() => { guardar(quitarFase(jugada, indice)); irAFase(Math.max(0, indice - 1)); }}><Trash size={13} />{t("Quitar fase")}</button>
          </div>
        </div>}
      </div>
      {/* Donde se hacen las fotos de cada fase para la tira, fuera de la vista. */}
      <div className="abp-fotografo" ref={fotografoRef} data-orientacion={orientacion} aria-hidden="true" />
    </section>
  </div>;
}

function SegmentosFlecha({ valor, onCambio }: { valor: EstiloFlecha; onCambio: (estilo: EstiloFlecha) => void }) {
  const opciones: Array<{ id: EstiloFlecha; nombre: string; titulo: string }> = [
    { id: "continua", nombre: t("Continua"), titulo: t("Línea continua: un pase o un movimiento.") },
    { id: "discontinua", nombre: t("Discontinua"), titulo: t("Línea discontinua: un desmarque sin balón.") },
    { id: "punteada", nombre: t("Punteada"), titulo: t("Línea de puntos: una opción, lo que podría pasar.") },
    { id: "ondulada", nombre: t("Ondulada"), titulo: t("Línea ondulada: el balón pegado al pie.") },
    { id: "linea", nombre: t("Línea"), titulo: t("Sin punta: una altura, un límite o la línea de fuera de juego.") },
    { id: "presion", nombre: t("Presión"), titulo: t("Una cuña desde quien presiona hacia el balón: el ángulo por donde llega.") },
  ];
  return <div className="inspector-segmentos">
    {opciones.map((o) => <button key={o.id} type="button" title={o.titulo} className={valor === o.id ? "activa" : ""} onClick={() => onCambio(o.id)}>{o.nombre}</button>)}
  </div>;
}

function SegmentosExtremo({ valor, onCambio }: { valor: Extremo; onCambio: (extremo: Extremo) => void }) {
  const opciones: Array<{ id: Extremo; nombre: string; titulo: string }> = [
    { id: "punta", nombre: "→", titulo: t("Con punta") },
    { id: "doble", nombre: "↔", titulo: t("Con punta en los dos lados") },
    { id: "barra", nombre: "⊣", titulo: t("Con una barra de parada: hasta aquí") },
    { id: "nada", nombre: "—", titulo: t("Sin punta") },
  ];
  return <div className="inspector-segmentos">
    {opciones.map((o) => <button key={o.id} type="button" title={o.titulo} aria-label={o.titulo} className={valor === o.id ? "activa" : ""} onClick={() => onCambio(o.id)}>{o.nombre}</button>)}
  </div>;
}

function SegmentosGrosor({ valor, onCambio }: { valor: Grosor; onCambio: (grosor: Grosor) => void }) {
  const opciones: Array<{ id: Grosor; nombre: string }> = [{ id: "fino", nombre: t("Fino") }, { id: "normal", nombre: t("Normal") }, { id: "grueso", nombre: t("Grueso") }];
  return <div className="inspector-segmentos">
    {opciones.map((o) => <button key={o.id} type="button" className={valor === o.id ? "activa" : ""} onClick={() => onCambio(o.id)}>{o.nombre}</button>)}
  </div>;
}

function SegmentosRelleno({ valor, onCambio }: { valor: RellenoBloque; onCambio: (relleno: RellenoBloque) => void }) {
  const opciones: Array<{ id: RellenoBloque; nombre: string; titulo: string }> = [
    { id: "atras", nombre: t("Atrás"), titulo: t("Sombrea el espacio que dejan a su espalda, hasta su portería.") },
    { id: "cerrado", nombre: t("Alrededor"), titulo: t("Un contorno alrededor de todos.") },
    { id: "linea", nombre: t("Línea"), titulo: t("Solo la línea que los une.") },
  ];
  return <div className="inspector-segmentos">
    {opciones.map((o) => <button key={o.id} type="button" title={o.titulo} className={valor === o.id ? "activa" : ""} onClick={() => onCambio(o.id)}>{o.nombre}</button>)}
  </div>;
}

/** La chuleta de atajos, encima del campo. */
function Atajos({ onCerrar }: { onCerrar: () => void }) {
  const lista: Array<[string, string]> = [
    [t("Espacio"), t("Reproducir o parar")],
    ["N", t("Añadir una fase")],
    ["[ ]  ·  1–9", t("Cambiar de fase")],
    ["← ↑ → ↓", t("Mover lo elegido medio metro (con Mayús, dos)")],
    [t("Supr"), t("Quitar lo elegido")],
    [t("Ctrl+Z  ·  Ctrl+Mayús+Z"), t("Deshacer y rehacer")],
    ["Ctrl+C  ·  Ctrl+V  ·  Ctrl+D", t("Copiar, pegar y duplicar (también en otra fase)")],
    ["H", t("Ocultar o enseñar las flechas")],
    [t("Intro"), t("Terminar el bloque")],
    ["Alt", t("Al arrastrar una ficha: sin alinearla con las demás")],
    ["Esc", t("Soltar la herramienta o la selección")],
  ];
  return <div className="abp-flotante abp-atajos" role="dialog" aria-label={t("Atajos de teclado")}>
    <header><b>{t("Atajos de teclado")}</b><button type="button" className="abp-enlace" onClick={onCerrar}>{t("Cerrar")}</button></header>
    <dl>{lista.map(([tecla, que]) => <div key={tecla}><dt>{tecla.split("  ·  ").map((k) => <kbd key={k}>{k}</kbd>)}</dt><dd>{que}</dd></div>)}</dl>
  </div>;
}

function SegmentosEstilo({ valor, onCambio }: { valor: EstiloZona; onCambio: (estilo: EstiloZona) => void }) {
  const opciones: Array<{ id: EstiloZona; nombre: string; titulo: string }> = [
    { id: "translucida", nombre: t("Velo"), titulo: t("Zona con color translúcido.") },
    { id: "rayas", nombre: t("Rayas"), titulo: t("Zona con rayas diagonales del color elegido.") },
    { id: "borde", nombre: t("Borde"), titulo: t("Zona con solo el perímetro.") },
  ];
  return <div className="inspector-segmentos">
    {opciones.map((o) => <button key={o.id} type="button" title={o.titulo} className={valor === o.id ? "activa" : ""} onClick={() => onCambio(o.id)}>{o.nombre}</button>)}
  </div>;
}

/** Lo que importa de una fase para encuadrarla: dónde empiezan y acaban las fichas que se mueven, y el balón. */
function puntosDe(fase: Fase): Punto[] {
  const puntos: Punto[] = [fase.balon];
  if (fase.pase) puntos.push(fase.pase.hasta);
  for (const c of fase.carreras) {
    const desde = fase.pos[c.fichaId];
    if (desde) puntos.push(desde, c.hasta);
  }
  if (puntos.length < 3) puntos.push(...Object.values(fase.pos));
  return puntos;
}

function centroDe(fase: Fase): Punto {
  const puntos = puntosDe(fase);
  return { x: puntos.reduce((s, p) => s + p.x, 0) / puntos.length, z: puntos.reduce((s, p) => s + p.z, 0) / puntos.length };
}

export default EstudioTactico;
