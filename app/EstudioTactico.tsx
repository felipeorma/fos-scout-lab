"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoDePuntero, type ReactNode } from "react";
import {
  agregarAnotacion, agregarFase, agregarFicha, anotacionCerca, cambiarAnotacion, cambiarDuracion, cambiarFicha, carreraDe, cuadernoInicial,
  curvarCarrera, desplazarAnotacion, distancia, duplicarFase, duracionTotal, fichaCerca, fijarCarrera, fijarPase, inicioDeFase, instanteEn,
  posar, posarBalon, cambiarPausa, AMBIENTE_POR_DEFECTO, normalizarCuaderno, nuevoId, quitarAnotacion, quitarCarrera, quitarFase, quitarFicha, quitarPase,
  renombrarFase, tipoDePase, deSerie, CATEGORIAS, ENCUADRES, SUPERFICIES, ZONAS,
  type Ambiente, type Categoria, type Cuaderno, type EstiloFlecha, type EstiloZona, type Fase, type Jugada, type Pase, type Punto,
} from "@/lib/abp";
import { t, tf, type Lang } from "@/lib/i18n";
import type { Borrador, Motor, Opciones, Seleccion, Vista } from "./abp/motor";
import { Tablero2D } from "./abp/tablero2d";
import { useFirma } from "./FirmaDelInforme";
import { Interruptor } from "./Interruptor";
import { Portal, archivoDeCuaderno, archivoDeSistema } from "./PortalDeSistemas";
import {
  ArrowDownToLine, Balon, Carrera, ChevronLeft, Cubo, Duplicar, Elipse, Etiqueta, Flecha, Mover, Pase as PaseIcono, Pause, Play, Plus, Rectangulo,
  RotateCcw, TextIcon, Trash, Video,
} from "./Icons";

// La clave no cambia al pasar de cuaderno a estudio: así se abre lo ya guardado.
const CLAVE = "fos-scout-abp-v1";
const CLAVE_MINIATURAS = "fos-scout-abp-miniaturas-v1";

type Herramienta = "mover" | "local" | "rival" | "balon" | "carrera" | "pase" | "flecha" | "texto" | "etiqueta" | "rect" | "zona";

/** Lo que se está arrastrando, con el cuaderno de antes para poder deshacerlo de una vez. */
type Arrastre = {
  tipo: "ficha" | "balon" | "anotacion" | "carrera" | "pase" | "flecha" | "rect" | "zona";
  id?: string;
  base: Cuaderno;
  desde: Punto;
  movido: boolean;
};

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
export function EstudioTactico({ claseHoja, idioma, paleta, onVolver }: {
  claseHoja: string;
  /** Solo para volver a dibujar los rótulos al cambiar de idioma. */
  idioma: Lang;
  /** La paleta del espacio: al cambiar, la grada y las fichas propias toman su color. */
  paleta: string;
  /** Sin datos cargados no hay menú de secciones: este botón lleva de vuelta a la portada. */
  onVolver?: () => void;
}) {
  const firma = useFirma();
  const deSerieEn = (texto: string) => deSerie(texto, idioma);
  const [cuaderno, setCuaderno] = useState<Cuaderno | null>(null);
  const historial = useRef<Cuaderno[]>([]);
  const [faseIdx, setFaseIdx] = useState(0);
  const [herramienta, setHerramienta] = useState<Herramienta>("mover");
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [borrador, setBorrador] = useState<Borrador>(null);
  const [origen, setOrigen] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("tactica");
  const [nombres, setNombres] = useState(true);
  const [modo, setModo] = useState<"portal" | "estudio">("portal");
  const [miniaturas, setMiniaturas] = useState<Record<string, string>>({});
  const [estiloFlecha, setEstiloFlecha] = useState<EstiloFlecha>("continua");
  const [seguir, setSeguir] = useState(false);
  const [estiloZona, setEstiloZona] = useState<EstiloZona>("translucida");
  const [tipoPase, setTipoPase] = useState<Pase["tipo"]>("aereo");
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
  const opciones = useMemo<Opciones>(() => ({
    colorLocal, colorRival, colorAnotacion, acento, nombres, fuente,
    ambiente: ambiente ?? AMBIENTE_POR_DEFECTO,
    rotulo: (rol) => deSerie(rol, idioma),
  }), [colorLocal, colorRival, colorAnotacion, acento, nombres, fuente, idioma, ambiente]);

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

  function reiniciar() {
    irAFase(0);
  }

  // ---- Cambiar la jugada ----
  function guardar(siguiente: Jugada) {
    if (!cuaderno) return;
    historial.current.push(cuaderno);
    if (historial.current.length > 80) historial.current.shift();
    setCuaderno(conJugada(cuaderno, siguiente));
  }

  /** Para lo que se cambia tecla a tecla: un solo paso de deshacer por edición. */
  function marcarHistorial() {
    if (!cuaderno) return;
    historial.current.push(cuaderno);
    if (historial.current.length > 80) historial.current.shift();
  }
  function sinHistorial(siguiente: Jugada) {
    setCuaderno((actual) => (actual ? conJugada(actual, siguiente) : actual));
  }

  function deshacer() {
    const previo = historial.current.pop();
    if (!previo) return;
    setCuaderno(previo);
    setSeleccion(null);
    setOrigen(null);
  }

  function borrarSeleccion() {
    if (!jugada || !seleccion) return;
    guardar(seleccion.tipo === "ficha" ? quitarFicha(jugada, seleccion.id) : quitarAnotacion(jugada, indice, seleccion.id));
    setSeleccion(null);
  }

  // Teclado: borrar, deshacer y salir. Solo con el cuaderno a la vista y sin estar escribiendo.
  useEffect(() => {
    const alPulsarTecla = (evento: KeyboardEvent) => {
      if (!raizRef.current?.offsetParent) return;
      const objetivo = evento.target as HTMLElement;
      if (objetivo.closest("input, textarea, select, [contenteditable='true']")) return;
      if (modo !== "estudio" || !jugada) return;
      if ((evento.key === "Delete" || evento.key === "Backspace") && seleccion) { evento.preventDefault(); borrarSeleccion(); }
      else if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "z") { evento.preventDefault(); deshacer(); }
      else if (evento.key === "Escape") { setOrigen(null); setBorrador(null); setSeleccion(null); }
      else if (evento.metaKey || evento.ctrlKey || evento.altKey) return;
      // Los atajos de siempre: espacio reproduce, N añade una fase, [ y ] cambian de fase.
      else if (evento.key === " ") { evento.preventDefault(); alternarReproduccion(); }
      else if (evento.key.toLowerCase() === "n") { guardar(agregarFase(jugada, indice, tf("Fase {n}", { n: jugada.fases.length + 1 }))); irAFase(indice + 1); }
      else if (evento.key === "[" && indice > 0) irAFase(indice - 1);
      else if (evento.key === "]" && indice < jugada.fases.length - 1) irAFase(indice + 1);
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
    if (evento.button !== 0 || !cuaderno || !jugada || !fase || grabando) return;
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
        const anotacion = anotacionCerca(fase, p);
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
      case "rect":
      case "zona":
        setBorrador({ tipo: herramienta, a: p, b: p, estilo: estiloFlecha });
        tomar(evento, { tipo: herramienta, base, desde: p, movido: false });
        return;
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
    if (arrastre.tipo === "ficha" && arrastre.id) return posar(j, indice, arrastre.id, p);
    if (arrastre.tipo === "balon") return posarBalon(j, indice, p);
    if (arrastre.tipo === "anotacion" && arrastre.id) return desplazarAnotacion(j, indice, arrastre.id, p.x - arrastre.desde.x, p.z - arrastre.desde.z);
    return null;
  }

  function alMover(evento: EventoDePuntero<HTMLDivElement>) {
    const arrastre = arrastreRef.current;
    if (!arrastre) return;
    const p = punto(evento);
    if (!p) return;
    if (distancia(p, arrastre.desde) > 0.3) arrastre.movido = true;
    const siguiente = aplicarArrastre(arrastre, p);
    if (siguiente) { if (arrastre.movido) sinHistorial(siguiente); return; }
    setBorrador((actual) => (actual ? { ...actual, b: p } : actual));
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
      historial.current.push(arrastre.base);
      if (historial.current.length > 80) historial.current.shift();
      setCuaderno(conJugada(arrastre.base, siguiente));
    };
    const movido = arrastre.movido || distancia(p, arrastre.desde) > 0.3;
    switch (arrastre.tipo) {
      case "ficha":
      case "balon":
      case "anotacion": {
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
      case "flecha":
      case "rect":
      case "zona": {
        if (distancia(p, arrastre.desde) < 0.8) return;
        const id = nuevoId("a");
        confirmar(agregarAnotacion(j, indice, arrastre.tipo === "flecha"
          ? { id, tipo: "flecha", a: arrastre.desde, b: p, color: j.colores.anotacion, estilo: estiloFlecha }
          : { id, tipo: arrastre.tipo, a: arrastre.desde, b: p, color: j.colores.anotacion, estilo: estiloZona }));
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
    irAFase(0, true);
  }

  function crear(nueva: Jugada) {
    if (!cuaderno) return;
    setCuaderno({ ...cuaderno, activa: nueva.id, jugadas: [...cuaderno.jugadas, nueva] });
    setModo("estudio");
    historial.current = [];
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
  function descargarSistema(id: string) {
    const sistema = cuaderno?.jugadas.find((j) => j.id === id);
    if (sistema) descargarJson(archivoDeSistema(sistema), `${archivo(sistema.nombre)}.json`);
  }
  function copiaDeTodo() {
    if (cuaderno) descargarJson(archivoDeCuaderno(cuaderno.jugadas), `estudio-tactico-${new Date().toISOString().slice(0, 10)}.json`);
  }

  function volverAlPortal() {
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
  const herramientas: Array<{ id: Herramienta; nombre: string; icono: ReactNode; ayuda: string }> = [
    { id: "mover", nombre: t("Mover"), icono: <Mover size={16} />, ayuda: t("Arrastra una ficha, el balón o una anotación. En el césped vacío, arrastra para girar la cámara.") },
    { id: "local", nombre: t("Local"), icono: <i className="abp-ficha-icono" style={{ background: colorLocal }} />, ayuda: t("Pulsa el césped para añadir una ficha propia.") },
    { id: "rival", nombre: t("Rival"), icono: <i className="abp-ficha-icono" style={{ background: colorRival }} />, ayuda: t("Pulsa el césped para añadir una ficha rival.") },
    { id: "balon", nombre: t("Balón"), icono: <Balon size={16} />, ayuda: t("Pulsa el césped para colocar el balón al empezar la fase.") },
    { id: "carrera", nombre: t("Carrera"), icono: <Carrera size={16} />, ayuda: t("Arrastra desde una ficha hasta su destino, o pulsa la ficha y después el destino. Sale discontinua.") },
    { id: "pase", nombre: t("Envío"), icono: <PaseIcono size={16} />, ayuda: t("Pulsa o arrastra hasta donde va el balón: sale desde donde está. Sale continua.") },
    { id: "flecha", nombre: t("Flecha"), icono: <Flecha size={16} />, ayuda: t("Arrastra sobre el césped para dibujar una flecha.") },
    { id: "texto", nombre: t("Texto"), icono: <TextIcon size={16} />, ayuda: t("Pulsa el césped para escribir un texto.") },
    { id: "etiqueta", nombre: t("Etiqueta"), icono: <Etiqueta size={16} />, ayuda: t("Pulsa el césped para poner una etiqueta.") },
    { id: "rect", nombre: t("Rectángulo"), icono: <Rectangulo size={16} />, ayuda: t("Arrastra sobre el césped para marcar un rectángulo.") },
    { id: "zona", nombre: t("Zona"), icono: <Elipse size={16} />, ayuda: t("Arrastra sobre el césped para marcar una zona.") },
  ];
  const herramientaActiva = herramientas.find((h) => h.id === herramienta)!;
  const fichaElegida = jugada && seleccion?.tipo === "ficha" ? jugada.fichas.find((f) => f.id === seleccion.id) ?? null : null;
  const carreraElegida = fichaElegida && fase ? carreraDe(fase, fichaElegida.id) : undefined;
  const anotacionElegida = fase && seleccion?.tipo === "anotacion" ? fase.anotaciones.find((a) => a.id === seleccion.id) ?? null : null;
  const vistas: Array<{ id: Vista; nombre: string }> = [
    { id: "tactica", nombre: t("Táctica") },
    { id: "3d", nombre: t("3D") },
    { id: "cenital", nombre: t("Cenital") },
  ];

  return <div className={claseHoja}>
    <section className="estilo-page abp-page" ref={raizRef}>
      <header className="abp-cabecera">
        <div>
          <span>{t("PIZARRA · 2D Y 3D")}</span>
          <h2>{modo === "estudio" && jugada ? jugada.nombre : t("Tus sistemas")}</h2>
          <p>{modo === "estudio"
            ? t("Coloca y dibuja cada fase; al reproducir, el movimiento de una fase a la siguiente se anima solo.")
            : t("Cada sistema que construyas —salida, presión, ataque, balón parado o un ejercicio—, listo para abrir, duplicar o descargar. Se guarda en este navegador.")}</p>
        </div>
        <div className="abp-cabecera-acciones">
          {modo === "estudio" && <button type="button" className="button secondary compact" onClick={volverAlPortal}><ChevronLeft size={14} />{t("Tus sistemas")}</button>}
          {onVolver && <button type="button" className="button secondary compact" onClick={onVolver}>{t("Volver al inicio")}</button>}
        </div>
      </header>

      {modo === "portal" && cuaderno && <Portal jugadas={cuaderno.jugadas} miniaturas={miniaturas} idioma={idioma}
        onAbrir={abrir} onCrear={crear} onDuplicar={duplicar} onQuitar={quitar} onImportar={importar} onDescargar={descargarSistema} onCopiaDeTodo={copiaDeTodo} />}

      <div className="abp-grid" hidden={modo !== "estudio"}>
        <aside className="designer-controls inspector abp-inspector">
          {jugada && cuaderno && <>
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
                <div className="inspector-fila abp-acciones">
                  <button type="button" onClick={() => descargarSistema(jugada.id)}><ArrowDownToLine size={14} />{t("Descargar archivo")}</button>
                </div>
              </div>
            </section>

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Herramientas")}</h3>
              <div className="abp-herramientas" role="toolbar" aria-label={t("Herramientas")}>
                {herramientas.map((h) => <button key={h.id} type="button" className={herramienta === h.id ? "activa" : ""} aria-pressed={herramienta === h.id}
                  title={h.ayuda} onClick={() => { setHerramienta(h.id); setOrigen(null); setAviso(""); }}>
                  {h.icono}<span>{h.nombre}</span>
                </button>)}
              </div>
              {herramienta === "flecha" && <div className="inspector-tarjeta abp-tarjeta-extra">
                <div className="inspector-fila"><span>{t("Trazo")}</span><SegmentosFlecha valor={estiloFlecha} onCambio={setEstiloFlecha} /></div>
              </div>}
              {(herramienta === "rect" || herramienta === "zona") && <div className="inspector-tarjeta abp-tarjeta-extra">
                <div className="inspector-fila"><span>{t("Relleno")}</span>
                  <SegmentosEstilo valor={estiloZona} onCambio={setEstiloZona} />
                </div>
              </div>}
              {herramienta === "pase" && <div className="inspector-tarjeta abp-tarjeta-extra">
                <div className="inspector-fila"><span>{t("Envío")}</span>
                  <div className="inspector-segmentos">
                    <button type="button" className={tipoPase === "aereo" ? "activa" : ""} onClick={() => setTipoPase("aereo")}>{t("Aéreo")}</button>
                    <button type="button" className={tipoPase === "raso" ? "activa" : ""} onClick={() => setTipoPase("raso")}>{t("Raso")}</button>
                  </div>
                </div>
              </div>}
              <p className="inspector-pie">{herramientaActiva.ayuda}</p>
            </section>

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
              <h3 className="inspector-titulo">{t("Anotación")}</h3>
              <div className="inspector-tarjeta">
                {(anotacionElegida.tipo === "texto" || anotacionElegida.tipo === "etiqueta") && <label className="inspector-fila"><span>{t("Texto")}</span>
                  <input ref={textoRef} className="abp-campo" value={anotacionElegida.texto} maxLength={80} onFocus={marcarHistorial}
                    onChange={(e) => sinHistorial(cambiarAnotacion(jugada, indice, anotacionElegida.id, { texto: e.target.value }))} />
                </label>}
                <label className="inspector-fila"><span>{t("Color")}</span>
                  <input type="color" value={anotacionElegida.color} onFocus={marcarHistorial} onChange={(e) => sinHistorial(cambiarAnotacion(jugada, indice, anotacionElegida.id, { color: e.target.value }))} />
                </label>
                {anotacionElegida.tipo === "flecha" && <div className="inspector-fila"><span>{t("Trazo")}</span>
                  <SegmentosFlecha valor={anotacionElegida.estilo} onCambio={(estilo) => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { estiloFlecha: estilo }))} />
                </div>}
                {(anotacionElegida.tipo === "rect" || anotacionElegida.tipo === "zona") && <div className="inspector-fila"><span>{t("Relleno")}</span>
                  <SegmentosEstilo valor={anotacionElegida.estilo} onCambio={(estilo) => guardar(cambiarAnotacion(jugada, indice, anotacionElegida.id, { estilo }))} />
                </div>}
                <div className="inspector-fila abp-acciones">
                  <button type="button" className="peligro" onClick={borrarSeleccion}><Trash size={14} />{t("Quitar anotación")}</button>
                </div>
              </div>
            </section>}

            {fase && <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Fase")}<small>{tf("{n} de {total}", { n: indice + 1, total: jugada.fases.length })}</small></h3>
              <div className="inspector-tarjeta">
                <label className="inspector-fila"><span>{t("Nombre")}</span>
                  <input className="abp-campo" value={deSerieEn(fase.nombre)} maxLength={40} onFocus={marcarHistorial} onChange={(e) => sinHistorial(renombrarFase(jugada, indice, e.target.value))} />
                </label>
                <label className="inspector-fila abp-fila-nota"><span>{t("Nota")}</span>
                  <textarea className="abp-nota" value={deSerieEn(fase.nota)} maxLength={160} rows={2} placeholder={t("Qué hay que ver en esta fase")} onFocus={marcarHistorial}
                    onChange={(e) => sinHistorial({ ...jugada, fases: jugada.fases.map((f, i) => (i === indice ? { ...f, nota: e.target.value } : f)) })} />
                </label>
                <label className="inspector-fila inspector-deslizador"><span>{t("Pausa en la pose")}</span><b>{fase.pausa.toFixed(1)} s</b>
                  <input type="range" min={0} max={6} step={0.1} value={fase.pausa} onPointerDown={marcarHistorial} onChange={(e) => sinHistorial(cambiarPausa(jugada, indice, Number(e.target.value)))} />
                </label>
                <label className="inspector-fila inspector-deslizador"><span>{t("Movimiento")}</span><b>{fase.duracion.toFixed(1)} s</b>
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
            </section>}

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Escenario")}</h3>
              <div className="inspector-tarjeta">
                <label className="inspector-fila"><span>{t("Césped")}</span>
                  <select className="inspector-selector" value={jugada.ambiente.superficie} onChange={(e) => cambiarAmbiente({ superficie: e.target.value as Ambiente["superficie"] })}>
                    {SUPERFICIES.map((x) => <option key={x.id} value={x.id}>{deSerieEn(x.nombre)}</option>)}
                  </select>
                </label>
                {jugada.ambiente.dimension === "3d" && <div className="inspector-fila"><span>{t("Estadio")}</span><Interruptor activo={jugada.ambiente.estadio} onCambio={(estadio) => cambiarAmbiente({ estadio })} titulo={t("Estadio")} /></div>}
                <div className="inspector-fila"><span>{t("Dentro de la ficha")}</span>
                  <div className="inspector-segmentos">
                    <button type="button" className={jugada.ambiente.fichas === "dorsal" ? "activa" : ""} onClick={() => cambiarAmbiente({ fichas: "dorsal" })}>{t("Dorsal")}</button>
                    <button type="button" className={jugada.ambiente.fichas === "puesto" ? "activa" : ""} onClick={() => cambiarAmbiente({ fichas: "puesto" })}>{t("Puesto")}</button>
                  </div>
                </div>
                <label className="inspector-fila"><span>{t("Zonas")}</span>
                  <select className="inspector-selector" value={jugada.ambiente.zonas} onChange={(e) => cambiarAmbiente({ zonas: e.target.value as Ambiente["zonas"] })}>
                    {ZONAS.map((x) => <option key={x.id} value={x.id}>{deSerieEn(x.nombre)}</option>)}
                  </select>
                </label>
                <label className="inspector-fila"><span>{t("Encuadre")}</span>
                  <select className="inspector-selector" value={jugada.ambiente.encuadre} onChange={(e) => cambiarAmbiente({ encuadre: e.target.value as Ambiente["encuadre"] })}>
                    {ENCUADRES.map((x) => <option key={x.id} value={x.id}>{deSerieEn(x.nombre)}</option>)}
                  </select>
                </label>
                <div className="inspector-fila"><span>{t("Nombres de los roles")}</span><Interruptor activo={nombres} onCambio={setNombres} titulo={t("Nombres de los roles")} /></div>
              </div>
            </section>

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Animación")}</h3>
              <div className="inspector-tarjeta">
                <div className="inspector-fila"><span>{t("Movimiento")}</span>
                  <div className="inspector-segmentos">
                    <button type="button" className={jugada.ambiente.suavizado === "suave" ? "activa" : ""} onClick={() => cambiarAmbiente({ suavizado: "suave" })}>{t("Suave")}</button>
                    <button type="button" className={jugada.ambiente.suavizado === "lineal" ? "activa" : ""} onClick={() => cambiarAmbiente({ suavizado: "lineal" })}>{t("Lineal")}</button>
                  </div>
                </div>
                <div className="inspector-fila"><span>{t("Estelas")}</span><Interruptor activo={jugada.ambiente.estelas} onCambio={(estelas) => cambiarAmbiente({ estelas })} titulo={t("Estelas")} /></div>
                <div className="inspector-fila"><span>{t("Cámara tras el balón")}</span><Interruptor activo={seguir} onCambio={setSeguir} titulo={t("Cámara tras el balón")} /></div>
              </div>
              <p className="inspector-pie">{t("De la segunda fase en adelante, mueve las fichas a su nueva posición: el estudio anima la diferencia desde la fase anterior.")}</p>
            </section>

            <section className="inspector-grupo">
              <h3 className="inspector-titulo">{t("Colores")}</h3>
              <div className="inspector-tarjeta">
                <label className="inspector-fila"><span>{t("Local")}</span>
                  {jugada.colores.local && <button type="button" className="abp-enlace" onClick={() => guardar({ ...jugada, colores: { ...jugada.colores, local: null } })}>{t("Del espacio")}</button>}
                  <input type="color" value={colorLocal} onFocus={marcarHistorial} onChange={(e) => sinHistorial({ ...jugada, colores: { ...jugada.colores, local: e.target.value } })} />
                </label>
                <label className="inspector-fila"><span>{t("Rival")}</span>
                  <input type="color" value={colorRival} onFocus={marcarHistorial} onChange={(e) => sinHistorial({ ...jugada, colores: { ...jugada.colores, rival: e.target.value } })} />
                </label>
                <label className="inspector-fila"><span>{t("Anotaciones")}</span>
                  <input type="color" value={colorAnotacion} onFocus={marcarHistorial} onChange={(e) => sinHistorial({ ...jugada, colores: { ...jugada.colores, anotacion: e.target.value } })} />
                </label>
              </div>
            </section>

            <section className="inspector-grupo">
              <div className="inspector-tarjeta">
                <button type="button" className="inspector-fila inspector-restablecer" onClick={deshacer}><RotateCcw size={14} />{t("Deshacer")}</button>
              </div>
              <p className="inspector-pie">{t("Atajos: espacio reproduce, N añade una fase, [ y ] cambian de fase, Supr borra, Ctrl+Z deshace.")}</p>
            </section>
          </>}
          <datalist id="abp-roles">{ROLES.map((rol) => <option key={rol} value={deSerieEn(rol)} />)}</datalist>
        </aside>

        <div className="abp-principal">
          <div className={`abp-escenario herramienta-${herramienta}`} ref={contenedorRef}
            onPointerDownCapture={alPulsar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar}>
            {!lista && !error && <p className="abp-cargando">{dimension === "3d" ? t("Preparando el estadio 3D…") : t("Preparando el tablero…")}</p>}
            {error && <p className="abp-cargando">{error}</p>}
            {fase && jugada && <div className="abp-flotante abp-fase-titulo" aria-live="polite">
              {/* "Fase 1 · Fase 1" no dice nada: el número solo va si la fase tiene nombre propio. */}
              <b>{/^(fase|phase) \d+$/i.test(fase.nombre.trim()) ? deSerieEn(fase.nombre) : tf("Fase {n} · {nombre}", { n: indice + 1, nombre: deSerieEn(fase.nombre) })}</b>
              {fase.nota.trim() && <span>{deSerieEn(fase.nota)}</span>}
            </div>}
            <div className="abp-flotante abp-vistas" role="group" aria-label={t("Vistas de cámara")}>
              {/* El tablero plano o el estadio: la misma jugada, dos maneras de verla. */}
              {jugada && <div className="inspector-segmentos abp-dimension">
                <button type="button" className={dimension === "2d" ? "activa" : ""} onClick={() => cambiarAmbiente({ dimension: "2d" })}>{t("2D")}</button>
                <button type="button" className={dimension === "3d" ? "activa" : ""} onClick={() => cambiarAmbiente({ dimension: "3d" })}>{t("3D")}</button>
              </div>}
              {dimension === "3d" ? <div className="inspector-segmentos">
                {vistas.map((v) => <button key={v.id} type="button" className={vista === v.id ? "activa" : ""} onClick={() => { setVista(v.id); escenaRef.current?.vista(v.id, encuadre, fase ? centroDe(fase) : null); }}>{v.nombre}</button>)}
              </div> : jugada && <div className="inspector-segmentos">
                <button type="button" className={orientacion === "horizontal" ? "activa" : ""} onClick={() => cambiarAmbiente({ orientacion: "horizontal" })}>{t("Horizontal")}</button>
                <button type="button" className={orientacion === "vertical" ? "activa" : ""} onClick={() => cambiarAmbiente({ orientacion: "vertical" })}>{t("Vertical")}</button>
              </div>}
              <button type="button" className="abp-boton-flotante" onClick={() => fase && escenaRef.current?.centrar(puntosDe(fase))}><Cubo size={14} />{t("Centrar jugada")}</button>
            </div>
            {(aviso || origen) && <p className="abp-flotante abp-aviso" role="status">{aviso}</p>}
          </div>

          {jugada && fase && <div className="abp-linea-de-tiempo">
            <div className="abp-fases" role="tablist" aria-label={t("Fases de la jugada")}>
              {jugada.fases.map((f, i) => <button key={f.id} type="button" role="tab" aria-selected={i === indice} className={i === indice ? "activa" : ""} onClick={() => irAFase(i)}>
                <b>{i + 1}</b>{deSerieEn(f.nombre)}
              </button>)}
              <span className="abp-fases-acciones">
                <button type="button" onClick={() => { guardar(agregarFase(jugada, indice, tf("Fase {n}", { n: jugada.fases.length + 1 }))); irAFase(indice + 1); }}><Plus size={13} />{t("Fase")}</button>
                <button type="button" onClick={() => { guardar(duplicarFase(jugada, indice, tf("{nombre} · copia", { nombre: deSerieEn(fase.nombre) }))); irAFase(indice + 1); }}><Duplicar size={13} />{t("Duplicar")}</button>
                <button type="button" disabled={jugada.fases.length < 2} onClick={() => { guardar(quitarFase(jugada, indice)); irAFase(Math.max(0, indice - 1)); }}><Trash size={13} />{t("Quitar")}</button>
              </span>
            </div>
            <div className="abp-reproductor">
              <button type="button" className="button primary compact abp-play" onClick={alternarReproduccion} disabled={grabando}>
                {reproduciendo ? <><Pause size={13} />{t("Pausa")}</> : <><Play size={13} />{t("Reproducir")}</>}
              </button>
              <button type="button" className="button secondary compact" onClick={reiniciar} disabled={grabando}><RotateCcw size={13} />{t("Reiniciar")}</button>
              <input ref={barraRef} className="abp-progreso" type="range" min={0} max={total} step={0.01} defaultValue={0} aria-label={t("Progreso de la jugada")}
                onChange={(e) => {
                  setReproduciendo(false);
                  tiempoRef.current = Number(e.target.value);
                  const ahora = instanteEn(jugada, tiempoRef.current);
                  if (ahora.fase !== indice) setFaseIdx(ahora.fase);
                  else escenaRef.current?.instante(ahora.t);
                }} />
              <span className="abp-descargas">
                <button type="button" className="button secondary compact" onClick={descargarImagen} disabled={!lista || grabando}><ArrowDownToLine size={13} />{t("PNG")}</button>
                <button type="button" className="button secondary compact" onClick={() => void descargarPdf()} disabled={!lista || grabando}><ArrowDownToLine size={13} />{t("PDF")}</button>
                <button type="button" className="button secondary compact" onClick={() => void grabarVideo()} disabled={!lista || grabando}><Video size={13} />{grabando ? t("Grabando…") : t("Vídeo")}</button>
              </span>
            </div>
          </div>}
        </div>
      </div>
    </section>
  </div>;
}

function SegmentosFlecha({ valor, onCambio }: { valor: EstiloFlecha; onCambio: (estilo: EstiloFlecha) => void }) {
  const opciones: Array<{ id: EstiloFlecha; nombre: string; titulo: string }> = [
    { id: "continua", nombre: t("Continua"), titulo: t("Línea continua: un pase o un movimiento.") },
    { id: "discontinua", nombre: t("Discontinua"), titulo: t("Línea discontinua: un desmarque sin balón.") },
    { id: "ondulada", nombre: t("Ondulada"), titulo: t("Línea ondulada: el balón pegado al pie.") },
    { id: "linea", nombre: t("Línea"), titulo: t("Sin punta: una altura, un límite o la línea de fuera de juego.") },
    { id: "presion", nombre: t("Presión"), titulo: t("Una cuña desde quien presiona hacia el balón: el ángulo por donde llega.") },
  ];
  return <div className="inspector-segmentos">
    {opciones.map((o) => <button key={o.id} type="button" title={o.titulo} className={valor === o.id ? "activa" : ""} onClick={() => onCambio(o.id)}>{o.nombre}</button>)}
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
