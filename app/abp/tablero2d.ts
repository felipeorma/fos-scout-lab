/**
 * El tablero 2D del estudio: la pizarra plana de un analista, en un lienzo.
 *
 * Dibuja lo mismo que el campo 3D —fichas, carreras, envíos, zonas, textos—
 * pero visto desde arriba y con el trazo de una pizarra de análisis: fichas
 * con relieve (una cúpula con su sombra en el césped, la luz arriba a la
 * izquierda y un brillo), flechas con un halo oscuro debajo para leerse en
 * cualquier césped y un envío elevado que se levanta con su sombra. Se vuelve
 * a pintar entero en cada cuadro: son pocas piezas y así la animación va
 * siempre a 60 por segundo.
 *
 * No carga three.js: abrir el estudio en 2D es inmediato.
 */

import {
  CAJA_DE_ENCUADRE, CAMPO, alturaDePase, antesDelPaso, balonAntesDelPaso, balonEn, capaDe, datosDeMaterial, distancia, enCurva, extremosDe, filaDeMaterial,
  lineaDeBloque, materialEn, pasesDe, pasoDe, pasosDe, posicionEn, puntosDeFlecha, sombraDeBloque, suavizar,
  type Anotacion, type Capa, type Encuadre, type Equipacion, type Extremo, type Fase, type Grosor, type Jugada, type Material, type Punto,
} from "@/lib/abp";
import { ALCANCE, APERTURA, miradaDe } from "@/lib/mirada";
import { abreviar, cajaDe, camaraDeCaja, interpolarCamara, transformacion, type Camara, type Transformacion } from "@/lib/tablero";
import { SUPERFICIE, luz, rgba, tintaSobre } from "./temas";
import { estaElegido, rotuloDeZona, vestido, type Borrador, type Motor, type Opciones, type Seleccion, type Vista } from "./motor";

const MEDIO_L = CAMPO.largo / 2, MEDIO_A = CAMPO.ancho / 2;
/** El radio de una ficha, en metros: algo más grande que un jugador, para leerse en un móvil. */
const RADIO = 1.6;
/**
 * En pantalla la ficha no pasa de 21 px ni baja de 11 (en las fotos pequeñas
 * de la tira y la biblioteca, de menos): al acercarse crece un poco, pero sobre
 * todo los jugadores se separan, que es para lo que se hace zoom.
 */
const radioEnPantalla = (escala: number, minimo = 11) => Math.max(minimo, Math.min(21, RADIO * escala));

const esPortero = (rol: string) => /^(portero|por|gk|goalkeeper)$/i.test(rol.trim());

/** Un color más oscuro, para el borde de la cúpula de una ficha. */
function oscurecer(hex: string, factor: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = (v: number) => Math.round(v * factor).toString(16).padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
const VIAJE_MS = 750;

type Px = { x: number; y: number };
/** Cuánto pesa cada grosor de trazo sobre el de serie. */
const FACTOR_GROSOR: Record<Grosor, number> = { fino: 0.62, normal: 1, grueso: 1.65 };
const metrosPorDefecto = (m: number) => `${m.toFixed(1)} m`;

/** Una línea quebrada sin `ini` píxeles del principio ni `fin` del final (para no pisar las fichas ni la punta). */
function recortar(puntos: Px[], ini: number, fin: number): Px[] {
  if (puntos.length < 2) return puntos;
  const tramos = puntos.slice(1).map((q, i) => Math.hypot(q.x - puntos[i].x, q.y - puntos[i].y));
  const total = tramos.reduce((s, l) => s + l, 0);
  if (total < 1) return puntos;
  // Si no cabe, se recorta menos: una flecha corta nunca desaparece.
  const escala = ini + fin > total * 0.8 ? (total * 0.8) / (ini + fin) : 1;
  const s0 = ini * escala, s1 = total - fin * escala;
  const salida: Px[] = [];
  let recorrido = 0;
  const en = (i: number, s: number) => {
    const k = tramos[i] ? (s - recorrido) / tramos[i] : 0;
    return { x: puntos[i].x + (puntos[i + 1].x - puntos[i].x) * k, y: puntos[i].y + (puntos[i + 1].y - puntos[i].y) * k };
  };
  for (let i = 0; i < tramos.length; i += 1) {
    const desde = recorrido, hasta = recorrido + tramos[i];
    if (hasta >= s0 && desde <= s1) {
      if (!salida.length) salida.push(en(i, Math.max(s0, desde)));
      salida.push(hasta <= s1 ? puntos[i + 1] : en(i, s1));
    }
    recorrido = hasta;
  }
  return salida.length >= 2 ? salida : puntos;
}

/** La misma línea en zigzag suave, como se pinta una conducción: `onda` px de largo y `amp` de alto. */
function ondular(puntos: Px[], onda: number, amp: number): Px[] {
  const tramos = puntos.slice(1).map((q, i) => Math.hypot(q.x - puntos[i].x, q.y - puntos[i].y));
  const total = tramos.reduce((s, l) => s + l, 0);
  if (total < 2) return puntos;
  const ondas = Math.max(2, Math.round(total / onda)), pasos = ondas * 12;
  const salida: Px[] = [];
  let i = 0, recorrido = 0;
  for (let k = 0; k <= pasos; k += 1) {
    const s = (total * k) / pasos;
    while (i < tramos.length - 1 && recorrido + tramos[i] < s) { recorrido += tramos[i]; i += 1; }
    const l = tramos[i] || 1, u = Math.min(1, (s - recorrido) / l);
    const a = puntos[i], b = puntos[i + 1];
    const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
    const v = s / total, alto = amp * Math.sin(v * ondas * Math.PI * 2) * Math.min(1, v * 6, (1 - v) * 6);
    salida.push({ x: a.x + (b.x - a.x) * u - uy * alto, y: a.y + (b.y - a.y) * u + ux * alto });
  }
  return salida;
}

export class Tablero2D implements Motor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private observador: ResizeObserver;
  private ancho = 0;
  private alto = 0;
  private jugada: Jugada | null = null;
  private indice = 0;
  private opciones: Opciones | null = null;
  private seleccion: Seleccion = null;
  private borrador: Borrador = null;
  private t = 0;
  private encuadre: Encuadre = "campo";
  private camara: Camara = { x: 0, z: 0, w: 120 };
  private viaje: { desde: Camara; hasta: Camara; inicio: number } | null = null;
  private cuadro = 0;
  private habilitado = true;
  private paneo: { x: number; y: number; camara: Camara } | null = null;
  seguirBalon = false;
  /** El radio mínimo de una ficha: 11 px en el campo; en una foto pequeña, en proporción. */
  private get radioMinimo() {
    return Math.max(5, Math.min(11, this.ancho / 70));
  }

  constructor(private contenedor: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "abp-lienzo";
    this.ctx = this.canvas.getContext("2d")!;
    contenedor.appendChild(this.canvas);
    this.canvas.addEventListener("wheel", this.alRodar, { passive: false });
    this.canvas.addEventListener("pointerdown", this.alPulsar);
    window.addEventListener("pointermove", this.alMover);
    window.addEventListener("pointerup", this.alSoltar);
    this.observador = new ResizeObserver(() => this.ajustarTamano());
    this.observador.observe(contenedor);
    this.ajustarTamano();
  }

  set orbitar(activo: boolean) {
    this.habilitado = activo;
    if (!activo) this.paneo = null;
  }

  destruir() {
    cancelAnimationFrame(this.cuadro);
    this.observador.disconnect();
    this.canvas.removeEventListener("wheel", this.alRodar);
    this.canvas.removeEventListener("pointerdown", this.alPulsar);
    window.removeEventListener("pointermove", this.alMover);
    window.removeEventListener("pointerup", this.alSoltar);
    this.canvas.remove();
  }

  private ajustarTamano() {
    const { clientWidth: w, clientHeight: h } = this.contenedor;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cambioDeForma = Math.abs(w / h - (this.ancho / Math.max(this.alto, 1))) > 0.01 || !this.ancho;
    this.ancho = w;
    this.alto = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cambioDeForma) this.camara = this.camaraDeEncuadre();
    this.pintar();
  }

  private get orientacion() {
    return this.opciones?.ambiente.orientacion ?? "horizontal";
  }

  private camaraDeEncuadre() {
    return camaraDeCaja(CAJA_DE_ENCUADRE[this.encuadre], this.ancho || 1, this.alto || 1, this.orientacion);
  }

  private tr(): Transformacion {
    return transformacion(this.camara, this.ancho || 1, this.alto || 1, this.orientacion);
  }

  // ---- Cámara: encuadres, centrar, paneo y zoom -----------------------------------------

  /** Viaja a una cámara con el zoom suave de lib/tablero.ts, por tiempo y no por cuadro. */
  private viajar(hasta: Camara, inmediato = false) {
    cancelAnimationFrame(this.cuadro);
    if (inmediato) {
      this.camara = hasta;
      this.viaje = null;
      this.pintar();
      return;
    }
    this.viaje = { desde: { ...this.camara }, hasta, inicio: performance.now() };
    const paso = () => {
      const v = this.viaje;
      if (!v) return;
      const k = Math.min(1, (performance.now() - v.inicio) / VIAJE_MS);
      this.camara = interpolarCamara(v.desde, v.hasta, suavizar(k));
      this.pintar();
      if (k < 1) this.cuadro = requestAnimationFrame(paso);
      else this.viaje = null;
    };
    this.cuadro = requestAnimationFrame(paso);
  }

  vista(_vista: Vista, encuadre: Encuadre, _centro: Punto | null, inmediato = false) {
    const cambiaOrientacion = this.opciones && this.ultimaOrientacion !== this.orientacion;
    this.encuadre = encuadre;
    this.ultimaOrientacion = this.orientacion;
    this.viajar(this.camaraDeEncuadre(), inmediato || Boolean(cambiaOrientacion));
  }
  private ultimaOrientacion = "horizontal";

  centrar(puntos: Punto[], inmediato = false) {
    if (!puntos.length) return this.viajar(this.camaraDeEncuadre(), inmediato);
    this.viajar(camaraDeCaja(cajaDe(puntos), this.ancho, this.alto, this.orientacion), inmediato);
  }

  private alRodar = (evento: WheelEvent) => {
    evento.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const x = evento.clientX - r.left, y = evento.clientY - r.top;
    const antes = this.tr().aCampo(x, y);
    const factor = Math.exp(evento.deltaY * 0.0016);
    const maximo = this.camaraDeEncuadre().w * 1.3;
    this.camara = { ...this.camara, w: Math.max(8, Math.min(maximo, this.camara.w * factor)) };
    // Que el punto bajo el ratón no se mueva: así se acerca a donde se mira.
    const despues = this.tr().aCampo(x, y);
    this.camara = { ...this.camara, x: this.camara.x + antes.x - despues.x, z: this.camara.z + antes.z - despues.z };
    this.viaje = null;
    this.pintar();
  };

  private alPulsar = (evento: PointerEvent) => {
    if (!this.habilitado || evento.button !== 0) return;
    this.paneo = { x: evento.clientX, y: evento.clientY, camara: { ...this.camara } };
  };

  private alMover = (evento: PointerEvent) => {
    if (!this.paneo || !this.habilitado) return;
    const tr = transformacion(this.paneo.camara, this.ancho, this.alto, this.orientacion);
    const a = tr.aCampo(this.paneo.x, this.paneo.y), b = tr.aCampo(evento.clientX, evento.clientY);
    this.camara = { ...this.paneo.camara, x: this.paneo.camara.x + a.x - b.x, z: this.paneo.camara.z + a.z - b.z };
    this.viaje = null;
    this.pintar();
  };

  private alSoltar = () => {
    this.paneo = null;
  };

  /** Acerca (factor > 1) o aleja alrededor del centro de la vista; devuelve el zoom en %, 100 = el encuadre. */
  acercar(factor: number) {
    const maximo = this.camaraDeEncuadre().w * 1.3;
    this.viajar({ ...this.camara, w: Math.max(8, Math.min(maximo, this.camara.w / factor)) });
    return this.zoom();
  }

  /** Cuánto se ha acercado respecto al encuadre, en %. */
  zoom() {
    return Math.round((this.camaraDeEncuadre().w / (this.viaje?.hasta.w ?? this.camara.w)) * 100);
  }

  puntoDelCampo(clienteX: number, clienteY: number): Punto | null {
    const r = this.canvas.getBoundingClientRect();
    return this.tr().aCampo(clienteX - r.left, clienteY - r.top);
  }

  // ---- Lo que se dibuja ----------------------------------------------------------------

  montar(jugada: Jugada, indice: number, opciones: Opciones, seleccion: Seleccion, borrador: Borrador) {
    const orientacionAntes = this.opciones?.ambiente.orientacion;
    this.jugada = jugada;
    this.indice = Math.min(indice, jugada.fases.length - 1);
    this.opciones = opciones;
    this.seleccion = seleccion;
    this.borrador = borrador;
    this.t = 0;
    if (orientacionAntes && orientacionAntes !== opciones.ambiente.orientacion) this.vista("tactica", this.encuadre, null, true);
    this.pintar();
  }

  instante(t: number) {
    this.t = t;
    const fase = this.fase;
    if (this.seguirBalon && fase) {
      // La cámara se desliza tras el balón; con el campo entero a la vista no hace falta.
      const b = balonEn(fase, t);
      const base = this.camaraDeEncuadre();
      if (this.camara.w < base.w * 0.92) {
        this.camara = { ...this.camara, x: this.camara.x + (b.x - this.camara.x) * 0.08, z: this.camara.z + (b.z - this.camara.z) * 0.08 };
      }
    }
    this.pintar();
  }

  renderizarAhora() {
    this.pintar();
  }

  capturar(tipo: "image/png" | "image/jpeg" = "image/png", calidad = 0.92) {
    this.pintar();
    return this.canvas.toDataURL(tipo, calidad);
  }

  private get fase(): Fase | null {
    return this.jugada?.fases[this.indice] ?? null;
  }

  private pintar() {
    const ctx = this.ctx, o = this.opciones;
    if (!this.ancho || !o) return;
    const tema = SUPERFICIE[o.ambiente.superficie];
    const tr = this.tr();
    ctx.save();
    ctx.fillStyle = tema.fondo;
    ctx.fillRect(0, 0, this.ancho, this.alto);
    this.pintarCampo(tr, o);
    const fase = this.fase, jugada = this.jugada;
    if (fase && jugada) {
      const lineal = o.ambiente.suavizado === "lineal";
      const ocultas = new Set<Capa>(o.ambiente.ocultas ?? []);
      const de = (...tipos: Anotacion["tipo"][]) => fase.anotaciones.filter((a) => tipos.includes(a.tipo) && !ocultas.has(capaDe(a)));
      const pintar = (a: Anotacion) => this.pintarAnotacion(tr, a, o, this.esElegida(a.id), 1, jugada, fase);
      // Abajo, lo que marca el césped: las zonas y la sombra de los bloques.
      for (const a of de("rect", "zona")) if ((a.tipo === "rect" || a.tipo === "zona") && a.estilo !== "foco") pintar(a);
      for (const a of de("bloque")) pintar(a);
      // El foco va encima de las zonas y debajo de flechas y fichas: apaga el césped de fuera, no a los jugadores.
      for (const a of de("rect", "zona")) if ((a.tipo === "rect" || a.tipo === "zona") && a.estilo === "foco") pintar(a);
      // Lo que ve el jugador elegido: una cuña hacia el balón, en el césped.
      if (o.ojos) this.pintarMirada(tr, jugada, fase, o.ojos, lineal);
      // El material va en el césped: debajo de las flechas y de los jugadores.
      // Si una pieza está en otro sitio en la fase siguiente, se ve moverse.
      for (const m of fase.material ?? []) this.pintarMaterial(tr, materialEn(jugada, this.indice, m, this.t, lineal), o, estaElegido(this.seleccion, "material", m.id));
      for (const a of de("flecha", "trazo")) pintar(a);
      if (!ocultas.has("recorridos")) {
        // Con varios pasos, cada acción lleva su número: se leen en orden.
        const numerar = pasosDe(fase) > 1;
        for (const c of fase.carreras) {
          const ficha = jugada.fichas.find((f) => f.id === c.fichaId);
          const desde = antesDelPaso(fase, c.fichaId, pasoDe(c));
          if (!ficha || !desde) continue;
          // Solo la primera sale de debajo de la ficha; las siguientes, de donde acabó la anterior.
          const enFicha = desde === fase.pos[c.fichaId];
          this.pintarCarrera(tr, desde, c.hasta, c.curva, this.colorDe(ficha.equipo, ficha.rol, o), o, 1, enFicha);
          if (numerar) this.pintarNumeroDePaso(tr, enCurva(desde, c.hasta, c.curva, enFicha ? 0.3 : 0.18), pasoDe(c) + 1, o);
        }
        for (const pase of pasesDe(fase)) {
          const desde = balonAntesDelPaso(fase, pasoDe(pase));
          this.pintarPase(tr, desde, pase.hasta, alturaDePase(desde, pase), o, 1);
          if (numerar) this.pintarNumeroDePaso(tr, { x: desde.x + (pase.hasta.x - desde.x) * 0.3, z: desde.z + (pase.hasta.z - desde.z) * 0.3 }, pasoDe(pase) + 1, o);
        }
      }
      if (o.ambiente.estelas && this.t > 0) this.pintarEstelas(tr, fase, jugada, o, lineal);
      if (this.borrador?.tipo === "guia") this.pintarGuia(tr, o);
      // La línea de cada medida va bajo los jugadores; su cifra, encima (más abajo).
      const medidas = de("medida");
      for (const a of medidas) if (a.tipo === "medida") this.conAlfa(() => this.pintarMedida(tr, a, fase, this.trazoDe(a.color || o.colorAnotacion, o), o, this.esElegida(a.id), "linea"));
      this.pintarBorrador(tr, o);
      for (const f of jugada.fichas) {
        const p = posicionEn(fase, f.id, this.t, lineal);
        const portero = esPortero(f.rol);
        if (!p) continue;
        const v = vestido(f, this.colorDe(f.equipo, f.rol, o), portero ? null : o.equipaciones[f.equipo]);
        this.pintarFicha(tr, p, f.dorsal, f.rol, v.color, o, estaElegido(this.seleccion, "ficha", f.id), v.equipacion, f.nombre);
      }
      this.pintarBalon(tr, balonEn(fase, this.t), o);
      // Encima de todo, lo que se lee: las medidas, los jugadores elegidos para un bloque y los textos.
      for (const a of medidas) if (a.tipo === "medida") this.conAlfa(() => this.pintarMedida(tr, a, fase, this.trazoDe(a.color || o.colorAnotacion, o), o, this.esElegida(a.id), "rotulo"));
      if (this.borrador?.tipo === "bloque") this.pintarElegidosDeBloque(tr, this.borrador.fichas, fase, o, lineal);
      for (const a of de("texto", "etiqueta")) pintar(a);
      // Las medidas de los espacios de juego, encima de todo para que se lean.
      for (const a of de("rect", "zona")) if ((a.tipo === "rect" || a.tipo === "zona") && a.medidas) this.pintarRotuloDeZona(tr, a, this.trazoDe(a.color || o.colorAnotacion, o), o);
    }
    ctx.restore();
  }

  /** La cuña de visión: dorada, que se apaga con la distancia, con sus dos bordes marcados. */
  private pintarMirada(tr: Transformacion, jugada: Jugada, fase: Fase, fichaId: string, lineal: boolean) {
    const m = miradaDe(jugada, fase, fichaId, this.t, lineal);
    if (!m) return;
    const ctx = this.ctx, mitad = (APERTURA / 2) * (Math.PI / 180);
    const c = tr.aPantalla(m.desde);
    const borde = (k: number) => {
      const a = m.angulo - mitad + 2 * mitad * k;
      return tr.aPantalla({ x: m.desde.x + Math.cos(a) * ALCANCE, z: m.desde.z + Math.sin(a) * ALCANCE });
    };
    ctx.save();
    const relleno = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, ALCANCE * tr.escala);
    relleno.addColorStop(0, "rgba(243,182,76,0.42)");
    relleno.addColorStop(1, "rgba(243,182,76,0)");
    ctx.fillStyle = relleno;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    for (let i = 0; i <= 24; i += 1) { const q = borde(i / 24); ctx.lineTo(q.x, q.y); }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(243,182,76,0.75)";
    ctx.lineWidth = Math.max(1, 0.12 * tr.escala);
    ctx.setLineDash([Math.max(3, 0.6 * tr.escala), Math.max(3, 0.5 * tr.escala)]);
    for (const k of [0, 1]) {
      const q = borde(k);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + (q.x - c.x) * 0.6, c.y + (q.y - c.y) * 0.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  private esElegida(id: string) {
    return estaElegido(this.seleccion, "anotacion", id);
  }

  /** El color de la ficha; el portero, en un tono propio como en el 3D. */
  private colorDe(equipo: "local" | "rival", rol: string, o: Opciones) {
    if (esPortero(rol)) return equipo === "local" ? "#f3b64c" : "#45c6ba";
    return equipo === "local" ? o.colorLocal : o.colorRival;
  }

  /** Lo que va debajo de cada trazo para que se lea: verde casi negro en el césped, blanco en papel. */
  private halo(o: Opciones) {
    return o.ambiente.superficie === "papel" ? "rgba(255,255,255,.9)" : "rgba(6,14,10,.82)";
  }

  /** Un trazo dos veces: primero el halo, ancho y oscuro, y encima el color. */
  private conHalo(o: Opciones, grosor: number, color: string, trazar: () => void) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = this.halo(o);
    ctx.lineWidth = grosor * 2.3 + 1;
    trazar();
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = grosor;
    trazar();
    ctx.stroke();
    ctx.restore();
  }

  /** En Papel, un color muy claro no se ve: se dibuja su trazo en gris. */
  private trazoDe(color: string, o: Opciones) {
    return o.ambiente.superficie === "papel" && luz(color) > 0.78 ? "#6b6f76" : color;
  }

  private pintarCampo(tr: Transformacion, o: Opciones) {
    const ctx = this.ctx, tema = SUPERFICIE[o.ambiente.superficie], e = tr.escala;
    const P = (x: number, z: number) => tr.aPantalla({ x, z });
    const poligono = (puntos: Array<[number, number]>) => {
      ctx.beginPath();
      puntos.forEach(([x, z], i) => { const p = P(x, z); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath();
    };
    // El verde con un margen alrededor de las líneas, y las franjas del segado.
    ctx.fillStyle = tema.base;
    poligono([[-MEDIO_L - 3, -MEDIO_A - 3], [MEDIO_L + 3, -MEDIO_A - 3], [MEDIO_L + 3, MEDIO_A + 3], [-MEDIO_L - 3, MEDIO_A + 3]]);
    ctx.fill();
    const franjas = 14, paso = CAMPO.largo / franjas;
    for (let i = 0; i < franjas; i += 1) {
      ctx.fillStyle = tema.franjas[i % 2];
      poligono([[-MEDIO_L + paso * i, -MEDIO_A], [-MEDIO_L + paso * (i + 1), -MEDIO_A], [-MEDIO_L + paso * (i + 1), MEDIO_A], [-MEDIO_L + paso * i, MEDIO_A]]);
      ctx.fill();
    }
    const linea = (a: [number, number], b: [number, number]) => { const p = P(...a), q = P(...b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };
    // Las zonas de trabajo, discontinuas y por debajo de las líneas del campo.
    const zonas = o.ambiente.zonas;
    if (zonas !== "ninguna") {
      ctx.save();
      ctx.strokeStyle = tema.zonas;
      ctx.fillStyle = tema.zonas;
      ctx.lineWidth = Math.max(1, 0.12 * e);
      ctx.setLineDash([Math.max(3, 1.2 * e), Math.max(3, 0.9 * e)]);
      if (zonas === "tercios" || zonas === "rejilla") for (const x of [-CAMPO.largo / 6, CAMPO.largo / 6]) linea([x, -MEDIO_A], [x, MEDIO_A]);
      if (zonas === "carriles" || zonas === "rejilla") for (const z of [-20.16, -9.16, 9.16, 20.16]) linea([-MEDIO_L, z], [MEDIO_L, z]);
      if (zonas === "zonas18") {
        for (let k = 1; k < 6; k += 1) linea([-MEDIO_L + (CAMPO.largo / 6) * k, -MEDIO_A], [-MEDIO_L + (CAMPO.largo / 6) * k, MEDIO_A]);
        for (const z of [-CAMPO.ancho / 6, CAMPO.ancho / 6]) linea([-MEDIO_L, z], [MEDIO_L, z]);
        ctx.setLineDash([]);
        ctx.font = `700 ${Math.max(10, 3 * e)}px ${o.fuente}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (let col = 0; col < 6; col += 1) for (let fila = 0; fila < 3; fila += 1) {
          const p = P(-MEDIO_L + (CAMPO.largo / 6) * (col + 0.5), -MEDIO_A + (CAMPO.ancho / 3) * (fila + 0.5));
          ctx.fillText(String(col * 3 + fila + 1), p.x, p.y);
        }
      }
      ctx.restore();
    }
    ctx.strokeStyle = tema.lineas;
    ctx.fillStyle = tema.lineas;
    ctx.lineWidth = Math.max(1, (o.ambiente.superficie === "tiza" ? 0.17 : 0.13) * e);
    const rect = (x0: number, z0: number, x1: number, z1: number) => { poligono([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]); ctx.stroke(); };
    const arco = (x: number, z: number, r: number, a0 = 0, a1 = Math.PI * 2) => {
      ctx.beginPath();
      for (let i = 0; i <= 48; i += 1) {
        const a = a0 + ((a1 - a0) * i) / 48;
        const p = P(x + Math.cos(a) * r, z + Math.sin(a) * r);
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
    };
    const punto = (x: number, z: number) => { const p = P(x, z); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, 0.22 * e), 0, Math.PI * 2); ctx.fill(); };
    rect(-MEDIO_L, -MEDIO_A, MEDIO_L, MEDIO_A);
    linea([0, -MEDIO_A], [0, MEDIO_A]);
    arco(0, 0, 9.15);
    punto(0, 0);
    for (const lado of [-1, 1]) {
      const fondo = lado * MEDIO_L;
      rect(fondo, -20.16, fondo - lado * 16.5, 20.16);
      rect(fondo, -9.16, fondo - lado * 5.5, 9.16);
      punto(fondo - lado * 11, 0);
      const dentro = Math.acos(5.5 / 9.15);
      if (lado > 0) arco(fondo - 11, 0, 9.15, Math.PI - dentro, Math.PI + dentro);
      else arco(fondo + 11, 0, 9.15, -dentro, dentro);
      for (const banda of [-1, 1]) {
        const a0 = lado > 0 ? (banda < 0 ? Math.PI / 2 : Math.PI) : (banda < 0 ? 0 : -Math.PI / 2);
        arco(fondo, banda * MEDIO_A, 1, a0, a0 + Math.PI / 2);
      }
      // La portería, vista desde arriba: el marco y una red tenue.
      ctx.save();
      ctx.lineWidth = Math.max(1.5, 0.2 * e);
      rect(fondo, -3.66, fondo + lado * 1.8, 3.66);
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(0.5, 0.05 * e);
      for (let z = -3.66 + 0.6; z < 3.66; z += 0.6) linea([fondo, z], [fondo + lado * 1.8, z]);
      ctx.restore();
    }
  }

  /** Una punta de flecha rellena en `b`, apuntando desde `a` (en píxeles), con su halo si se da. */
  private punta(a: { x: number; y: number }, b: { x: number; y: number }, largo: number, color: string, halo?: string) {
    const ctx = this.ctx, ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - largo * Math.cos(ang - 0.42), b.y - largo * Math.sin(ang - 0.42));
    ctx.lineTo(b.x - largo * 0.7 * Math.cos(ang), b.y - largo * 0.7 * Math.sin(ang));
    ctx.lineTo(b.x - largo * Math.cos(ang + 0.42), b.y - largo * Math.sin(ang + 0.42));
    ctx.closePath();
    if (halo) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = halo;
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(3, largo * 0.32);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.fill();
  }

  private pintarCarrera(tr: Transformacion, desde: Punto, hasta: Punto, curva: number, color: string, o: Opciones, alfa = 1, desdeFicha = true) {
    const ctx = this.ctx, e = tr.escala;
    const largo = Math.hypot(hasta.x - desde.x, hasta.z - desde.z);
    if (largo < 0.3) return;
    const tIni = desdeFicha ? Math.min(0.45, (radioEnPantalla(e, this.radioMinimo) * 1.1) / e / largo) : 0.04;
    const tFin = Math.max(tIni, 1 - Math.min(0.4, 1 / largo));
    const trazo = this.trazoDe(color, o);
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.setLineDash([Math.max(4, 0.9 * e), Math.max(4, 0.75 * e)]);
    this.conHalo(o, Math.max(1.8, 0.28 * e), trazo, () => {
      ctx.beginPath();
      for (let i = 0; i <= 32; i += 1) {
        const p = tr.aPantalla(enCurva(desde, hasta, curva, tIni + ((tFin - tIni) * i) / 32));
        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
      }
    });
    ctx.setLineDash([]);
    this.punta(tr.aPantalla(enCurva(desde, hasta, curva, 0.95)), tr.aPantalla(hasta), Math.max(9, 1.4 * e), trazo, this.halo(o));
    ctx.restore();
  }

  /** Un envío: raso, una línea; elevado, el balón se levanta y deja su sombra en el césped. */
  private pintarPase(tr: Transformacion, desde: Punto, hasta: Punto, altura: number, o: Opciones, alfa: number) {
    const ctx = this.ctx, e = tr.escala, tinta = SUPERFICIE[o.ambiente.superficie].aro;
    if (Math.hypot(hasta.x - desde.x, hasta.z - desde.z) < 0.3) return;
    const puntos: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 40; i += 1) {
      const u = i / 40;
      const p = tr.aPantalla({ x: desde.x + (hasta.x - desde.x) * u, z: desde.z + (hasta.z - desde.z) * u });
      // La altura se dibuja hacia arriba de la pantalla, como una cámara que mira algo inclinada.
      puntos.push({ x: p.x, y: p.y - altura * 4 * u * (1 - u) * 0.55 * e });
    }
    ctx.save();
    ctx.globalAlpha = alfa;
    if (altura > 0) {
      ctx.strokeStyle = "rgba(0,0,0,.28)";
      ctx.lineWidth = Math.max(1, 0.16 * e);
      ctx.setLineDash([Math.max(3, 0.6 * e), Math.max(3, 0.6 * e)]);
      const a = tr.aPantalla(desde), b = tr.aPantalla(hasta);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    const fin = puntos.length - 3;
    this.conHalo(o, Math.max(2, 0.32 * e), tinta, () => {
      ctx.beginPath();
      puntos.slice(0, fin).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    });
    this.punta(puntos[fin - 2], puntos[puntos.length - 1], Math.max(10, 1.5 * e), tinta, this.halo(o));
    ctx.restore();
  }

  /** El número de un paso: un círculo pequeño del color de acento, junto al arranque de la acción. */
  private pintarNumeroDePaso(tr: Transformacion, p: Punto, n: number, o: Opciones) {
    const ctx = this.ctx, c = tr.aPantalla(p), r = Math.max(7, Math.min(11, 0.65 * tr.escala));
    ctx.save();
    ctx.fillStyle = this.halo(o);
    ctx.beginPath(); ctx.arc(c.x, c.y, r + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = o.acento;
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tintaSobre(o.acento);
    ctx.font = `800 ${r * 1.15}px ${o.fuente}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), c.x, c.y + r * 0.06);
    ctx.restore();
  }

  /** Lo que ya recorrió cada ficha y el balón, desvaneciéndose hacia atrás. */
  private pintarEstelas(tr: Transformacion, fase: Fase, jugada: Jugada, o: Opciones, lineal: boolean) {
    const ctx = this.ctx, e = tr.escala, tramo = 0.45;
    const estela = (punto: (u: number) => Punto, color: string, levanta?: (u: number) => number) => {
      const t1 = this.t, t0 = Math.max(0, t1 - tramo), pasos = 14;
      ctx.lineCap = "round";
      for (let i = 0; i < pasos; i += 1) {
        const ua = t0 + ((t1 - t0) * i) / pasos, ub = t0 + ((t1 - t0) * (i + 1)) / pasos;
        const a = tr.aPantalla(punto(ua)), b = tr.aPantalla(punto(ub));
        const ya = levanta ? levanta(ua) : 0, yb = levanta ? levanta(ub) : 0;
        ctx.strokeStyle = rgba(color, 0.05 + 0.5 * ((i + 1) / pasos));
        ctx.lineWidth = Math.max(2, radioEnPantalla(e, this.radioMinimo) * 0.9 * ((i + 1) / pasos));
        ctx.beginPath(); ctx.moveTo(a.x, a.y - ya); ctx.lineTo(b.x, b.y - yb); ctx.stroke();
      }
    };
    // La estela sigue el recorrido de verdad, con sus pasos: así una pared deja su dibujo.
    for (const id of new Set(fase.carreras.map((c) => c.fichaId))) {
      const ficha = jugada.fichas.find((f) => f.id === id);
      if (!ficha || !fase.pos[id]) continue;
      const color = this.trazoDe(this.colorDe(ficha.equipo, ficha.rol, o), o);
      estela((u) => posicionEn(fase, id, u, lineal) ?? fase.pos[id], color);
    }
    if (fase.pases.length) {
      const tinta = SUPERFICIE[o.ambiente.superficie].aro;
      estela((u) => balonEn(fase, u), tinta, (u) => balonEn(fase, u).y * 0.55 * e);
    }
  }

  /**
   * Una ficha con relieve: la sombra de contacto en el césped, la cúpula con la
   * luz arriba a la izquierda, un aro oscuro por dentro y otro claro por fuera,
   * y un brillo. Así se separa del césped sin sombras borrosas.
   */
  private pintarFicha(tr: Transformacion, p: Punto, dorsal: string, rol: string, color: string, o: Opciones, elegida: boolean, equipacion: Equipacion | null = null, propio = "") {
    const ctx = this.ctx, e = tr.escala, tema = SUPERFICIE[o.ambiente.superficie];
    const c = tr.aPantalla(p), r = radioEnPantalla(e, this.radioMinimo);
    const delRol = o.rotulo(rol);
    // Dentro, el dorsal o el puesto; debajo, el nombre del jugador si lo tiene, o el rol.
    const dentro = o.ambiente.fichas === "puesto" && delRol.trim() ? abreviar(delRol) : dorsal;
    const nombre = propio.trim() || delRol;
    const papel = o.ambiente.superficie === "papel";
    ctx.save();
    if (elegida) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 1.42, 0, Math.PI * 2);
      ctx.strokeStyle = o.acento;
      ctx.lineWidth = Math.max(2, r * 0.14);
      ctx.setLineDash([r * 0.36, r * 0.28]);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // La sombra de contacto: una elipse que se apaga hacia fuera, algo por debajo.
    ctx.save();
    ctx.translate(c.x, c.y + r * 0.36);
    ctx.scale(1.18, 0.86);
    const sombra = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    sombra.addColorStop(0, papel ? "rgba(20,26,22,.26)" : "rgba(0,0,0,.5)");
    sombra.addColorStop(0.6, papel ? "rgba(20,26,22,.12)" : "rgba(0,0,0,.24)");
    sombra.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sombra;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // La camiseta —el color y su dibujo— y encima la sombra de la cúpula: la luz
    // entra por arriba a la izquierda y el borde se oscurece, con o sin dibujo.
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    if (equipacion && equipacion.patron !== "liso") this.pintarPatron(c, r, color, equipacion);
    const cupula = ctx.createRadialGradient(c.x - r * 0.28, c.y - r * 0.44, 0, c.x - r * 0.28, c.y - r * 0.44, r * 1.64);
    cupula.addColorStop(0, "rgba(0,0,0,0)");
    cupula.addColorStop(0.76, "rgba(0,0,0,.2)");
    cupula.addColorStop(1, "rgba(0,0,0,.2)");
    ctx.fillStyle = cupula;
    ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    ctx.restore();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "rgba(0,0,0,.26)";
    ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.98, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // El ribete: el borde con el segundo color de la equipación.
    const ribete = equipacion?.ribete ? equipacion.secundario : null;
    ctx.strokeStyle = ribete ?? (papel && luz(color) > 0.78 ? "#6b6f76" : rgba(tema.aro, 0.88));
    ctx.lineWidth = Math.max(1.2, r * (ribete ? 0.16 : 0.1));
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // El brillo, una elipse blanca que se apaga.
    ctx.save();
    ctx.translate(c.x - r * 0.22, c.y - r * 0.34);
    ctx.scale(0.46, 0.3);
    const brillo = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    brillo.addColorStop(0, "rgba(255,255,255,.6)");
    brillo.addColorStop(0.7, "rgba(255,255,255,0)");
    ctx.fillStyle = brillo;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const tinta = equipacion?.dorsal === "blanco" ? "#ffffff" : equipacion?.dorsal === "negro" ? "#0b0b0e" : tintaSobre(color);
    ctx.font = `900 ${r * (dentro.length > 2 ? 0.7 : 0.86)}px ${o.fuente}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Sobre un dibujo, el número lleva un perfilado para leerse encima de los dos colores.
    if (equipacion && equipacion.patron !== "liso") {
      ctx.strokeStyle = tinta === "#ffffff" ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.6)";
      ctx.lineWidth = r * 0.16;
      ctx.lineJoin = "round";
      ctx.strokeText(dentro, c.x, c.y + r * 0.05);
    }
    ctx.fillStyle = tinta;
    ctx.fillText(dentro, c.x, c.y + r * 0.05);
    // El rol debajo, en una píldora que se lee en cualquier césped.
    const debajo = o.nombres && nombre.trim() && (o.ambiente.fichas === "dorsal" || propio.trim() || nombre.trim().length > 3) ? nombre.toUpperCase() : "";
    if (debajo) {
      const alto = Math.max(11, r * 0.74);
      ctx.font = `800 ${alto * 0.66}px ${o.fuente}`;
      const ancho = ctx.measureText(debajo).width + alto * 0.8;
      const y = c.y + r + alto * 0.3;
      ctx.fillStyle = papel ? "rgba(255,255,255,.92)" : "rgba(8,10,9,.74)";
      ctx.beginPath();
      ctx.roundRect(c.x - ancho / 2, y, ancho, alto, alto * 0.3);
      ctx.fill();
      ctx.fillStyle = papel ? "#1d1d1f" : "#f5f5f7";
      ctx.fillText(debajo, c.x, y + alto / 2 + alto * 0.04);
    }
    ctx.restore();
  }

  /** El dibujo de la camiseta dentro del círculo (ya recortado): rayas, aros, mitades, banda o degradado. */
  private pintarPatron(c: { x: number; y: number }, r: number, base: string, equipacion: Equipacion) {
    const ctx = this.ctx, otro = equipacion.secundario, ancho = r * 0.42;
    ctx.fillStyle = otro;
    switch (equipacion.patron) {
      case "rayas":
        for (const k of [-3, -1, 1, 3]) ctx.fillRect(c.x + k * ancho - ancho / 2, c.y - r, ancho, r * 2);
        break;
      case "aros":
        for (const k of [-3, -1, 1, 3]) ctx.fillRect(c.x - r, c.y + k * ancho - ancho / 2, r * 2, ancho);
        break;
      case "mitades":
        ctx.fillRect(c.x - r, c.y - r, r, r * 2);
        break;
      case "banda":
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-r * 0.32, -r * 1.5, r * 0.64, r * 3);
        ctx.restore();
        break;
      case "degradado": {
        const degradado = ctx.createLinearGradient(c.x - r, c.y - r, c.x + r, c.y + r);
        degradado.addColorStop(0.15, base);
        degradado.addColorStop(0.95, otro);
        ctx.fillStyle = degradado;
        ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
        break;
      }
    }
  }

  /**
   * Una pieza de material vista desde arriba, a su tamaño en metros (con un
   * mínimo en pantalla para que una seta no desaparezca al alejarse).
   */
  private pintarMaterial(tr: Transformacion, m: Material, o: Opciones, elegida: boolean, alfa = 1) {
    const ctx = this.ctx, e = tr.escala, datos = datosDeMaterial(m.tipo);
    const g = (m.giro * Math.PI) / 180, cos = Math.cos(g), sin = Math.sin(g);
    // De las medidas de la pieza (lx a lo largo, lz a lo ancho, en metros) a la pantalla.
    const P = (lx: number, lz: number) => tr.aPantalla({ x: m.p.x + lx * cos - lz * sin, z: m.p.z + lx * sin + lz * cos });
    const c = tr.aPantalla(m.p);
    // Como en cualquier pizarra, lo pequeño se dibuja algo mayor que en la realidad: una seta de 20 cm no se vería.
    const tamano = (metros: number, minimo: number) => Math.max(minimo, metros * e * 1.5);
    const segmento = (a: [number, number], b: [number, number]) => { const p = P(...a), q = P(...b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); };
    const sombra = o.ambiente.superficie === "papel" ? "rgba(0,0,0,.18)" : "rgba(0,0,0,.45)";
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Una pieza agrandada o encogida: todo lo suyo, alrededor de su centro.
    const escala = m.escala ?? 1;
    if (escala !== 1) { ctx.translate(c.x, c.y); ctx.scale(escala, escala); ctx.translate(-c.x, -c.y); }
    switch (m.tipo) {
      case "seta": {
        const r = tamano(0.2, 4);
        ctx.fillStyle = sombra;
        ctx.beginPath(); ctx.ellipse(c.x + r * 0.15, c.y + r * 0.25, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.45)";
        ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.38, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "cono": {
        const r = tamano(0.24, 5);
        ctx.fillStyle = sombra;
        ctx.beginPath(); ctx.ellipse(c.x + r * 0.5, c.y + r * 0.45, r * 1.15, r * 0.7, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = oscurecer(m.color, 0.78);
        ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
        ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.86, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.lineWidth = Math.max(1, r * 0.18);
        ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.5, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case "pica": {
        // Desde arriba, una pica es un punto: se dibuja su sombra larga para que se lea alta.
        const r = tamano(0.06, 2.8);
        ctx.strokeStyle = sombra;
        ctx.lineWidth = r * 1.4;
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + r * 5, c.y + r * 3); ctx.stroke();
        ctx.fillStyle = "rgba(20,20,22,.7)";
        ctx.beginPath(); ctx.arc(c.x, c.y, r * 1.9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = m.color;
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.beginPath(); ctx.arc(c.x - r * 0.3, c.y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "valla": {
        ctx.strokeStyle = sombra;
        ctx.lineWidth = tamano(0.12, 3);
        segmento([0.08, -0.3], [0.08, 0.3]);
        ctx.strokeStyle = m.color;
        ctx.lineWidth = tamano(0.07, 2.2);
        segmento([0, -0.3], [0, 0.3]);
        ctx.lineWidth = tamano(0.05, 1.6);
        segmento([-0.14, -0.3], [0.14, -0.3]);
        segmento([-0.14, 0.3], [0.14, 0.3]);
        break;
      }
      case "aro": {
        ctx.strokeStyle = m.color;
        ctx.lineWidth = tamano(0.05, 1.8);
        ctx.beginPath(); ctx.arc(c.x, c.y, tamano(0.35, 4.5), 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case "escalera": {
        ctx.strokeStyle = m.color;
        ctx.lineWidth = tamano(0.04, 1.4);
        segmento([-2, -0.25], [2, -0.25]);
        segmento([-2, 0.25], [2, 0.25]);
        for (let x = -2; x <= 2.001; x += 0.5) segmento([x, -0.25], [x, 0.25]);
        break;
      }
      case "balon": {
        const r = tamano(0.11, 3.6);
        ctx.fillStyle = sombra;
        ctx.beginPath(); ctx.ellipse(c.x, c.y + r * 0.35, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.55)";
        ctx.lineWidth = Math.max(1, r * 0.2);
        ctx.stroke();
        break;
      }
      case "maniqui": {
        // El cuerpo, una elipse de hombro a hombro, y la cabeza en medio.
        ctx.fillStyle = sombra;
        ctx.beginPath(); ctx.ellipse(c.x + 3, c.y + 4, tamano(0.32, 6), tamano(0.32, 6) * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        for (let k = 0; k <= 24; k += 1) {
          const a = (k / 24) * Math.PI * 2, q = P(Math.cos(a) * 0.15, Math.sin(a) * 0.3);
          if (k) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
        }
        ctx.closePath();
        ctx.fillStyle = m.color;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = oscurecer(m.color, 0.72);
        ctx.beginPath(); ctx.arc(c.x, c.y, tamano(0.11, 2.4), 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "miniporteria":
      case "porteria": {
        // La boca mira hacia +x de la pieza; la red queda detrás.
        const ancho = datos.ancho / 2, fondo = datos.largo;
        ctx.strokeStyle = "rgba(255,255,255,.35)";
        ctx.lineWidth = Math.max(0.6, 0.03 * e);
        for (let z = -ancho; z <= ancho + 0.001; z += ancho / 6) segmento([0, z], [-fondo, z]);
        for (let x = 0; x <= fondo + 0.001; x += fondo / 3) segmento([-x, -ancho], [-x, ancho]);
        ctx.strokeStyle = m.color;
        ctx.lineWidth = tamano(m.tipo === "porteria" ? 0.12 : 0.06, 2);
        segmento([0, -ancho], [0, ancho]);
        ctx.lineWidth = tamano(0.05, 1.4);
        segmento([0, -ancho], [-fondo, -ancho]);
        segmento([0, ancho], [-fondo, ancho]);
        segmento([-fondo, -ancho], [-fondo, ancho]);
        break;
      }
    }
    if (elegida) {
      ctx.strokeStyle = o.acento;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(9, (Math.max(datos.largo, datos.ancho) / 2) * e + 5), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private pintarBalon(tr: Transformacion, b: Punto & { y: number }, o: Opciones) {
    const ctx = this.ctx, e = tr.escala;
    const suelo = tr.aPantalla(b), r = Math.max(4, 0.55 * e);
    const arriba = b.y * 0.55 * e;
    ctx.save();
    // La sombra se queda en el césped y encoge al subir el balón.
    ctx.fillStyle = `rgba(0,0,0,${0.4 / (1 + b.y * 0.15)})`;
    ctx.beginPath();
    ctx.ellipse(suelo.x, suelo.y + r * 0.35, r * (1 / (1 + b.y * 0.08)), r * 0.5 / (1 + b.y * 0.08), 0, 0, Math.PI * 2);
    ctx.fill();
    const c = { x: suelo.x, y: suelo.y - arriba };
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.18);
    ctx.strokeStyle = o.ambiente.superficie === "papel" ? "#1d1d1f" : "rgba(0,0,0,.55)";
    ctx.stroke();
    // Un pentágono en el centro: se reconoce como balón aunque sea pequeño.
    ctx.fillStyle = "#1d1d1f";
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const x = c.x + Math.cos(a) * r * 0.42, y = c.y + Math.sin(a) * r * 0.42;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private pintarAnotacion(tr: Transformacion, a: Anotacion, o: Opciones, elegida: boolean, alfa = 1, jugada = this.jugada, fase = this.fase) {
    const ctx = this.ctx, e = tr.escala;
    const color = this.trazoDe(a.color || o.colorAnotacion, o);
    const halo = this.halo(o);
    if (a.tipo === "flecha" || a.tipo === "medida" || a.tipo === "bloque" || a.tipo === "trazo") {
      if (!fase || !jugada) return;
      ctx.save();
      ctx.globalAlpha = alfa;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (a.tipo === "flecha") this.pintarFlecha(tr, a, fase, color, o, elegida);
      else if (a.tipo === "medida") this.pintarMedida(tr, a, fase, color, o, elegida);
      else if (a.tipo === "bloque") this.pintarBloque(tr, a, jugada, fase, color, o, elegida);
      else this.pintarTrazo(tr, a.puntos, color, o, elegida, a.grosor ?? "normal", a.punta === true);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (a.tipo === "texto" || a.tipo === "etiqueta") {
      const p = tr.aPantalla(a.a);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (a.tipo === "texto") {
        // Como un rótulo de retransmisión: letra gruesa con un contorno del color del césped.
        const alto = Math.max(14, 2.6 * e);
        ctx.font = `900 ${alto}px ${o.fuente}`;
        ctx.strokeStyle = halo;
        ctx.lineWidth = alto * 0.3;
        ctx.strokeText(a.texto || "·", p.x, p.y);
        ctx.fillStyle = color;
        ctx.fillText(a.texto || "·", p.x, p.y);
      } else {
        const alto = Math.max(16, 1.9 * e);
        ctx.font = `800 ${alto * 0.58}px ${o.fuente}`;
        const ancho = ctx.measureText(a.texto || "·").width + alto * 0.9;
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.roundRect(p.x - ancho / 2 - 1.5, p.y - alto / 2 - 1.5, ancho + 3, alto + 3, alto * 0.32);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(p.x - ancho / 2, p.y - alto / 2, ancho, alto, alto * 0.28);
        ctx.fill();
        ctx.fillStyle = tintaSobre(color);
        ctx.fillText((a.texto || "·").toUpperCase(), p.x, p.y + alto * 0.03);
      }
      if (elegida) {
        ctx.strokeStyle = o.acento;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x - 4 * e, p.y - 1.6 * e, 8 * e, 3.2 * e);
      }
      ctx.restore();
      return;
    }
    if (a.tipo !== "rect" && a.tipo !== "zona") { ctx.restore(); return; }
    const A = tr.aPantalla(a.a), B = tr.aPantalla(a.b);
    // Rectángulo o zona: el contorno de cada una, para rellenar, recortar o apagar lo de fuera.
    const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
    const esquinas = a.tipo === "rect"
      ? [tr.aPantalla({ x: a.a.x, z: a.a.z }), tr.aPantalla({ x: a.b.x, z: a.a.z }), tr.aPantalla({ x: a.b.x, z: a.b.z }), tr.aPantalla({ x: a.a.x, z: a.b.z })]
      : [];
    const contorno = () => {
      if (a.tipo === "rect") {
        const lx = Math.min(...esquinas.map((q) => q.x)), ly = Math.min(...esquinas.map((q) => q.y));
        const ancho = Math.max(...esquinas.map((q) => q.x)) - lx, alto = Math.max(...esquinas.map((q) => q.y)) - ly;
        ctx.roundRect(lx, ly, ancho, alto, Math.min(0.6 * e, ancho / 4, alto / 4));
      } else {
        ctx.ellipse((A.x + B.x) / 2, (A.y + B.y) / 2, Math.max(2, (x1 - x0) / 2), Math.max(2, (y1 - y0) / 2), 0, 0, Math.PI * 2);
      }
    };
    if (a.estilo === "foco") {
      // Todo lo de fuera, velado; dentro el césped de siempre, con un marco discontinuo y sus esquinas.
      ctx.beginPath();
      ctx.rect(0, 0, this.ancho, this.alto);
      contorno();
      ctx.fillStyle = o.ambiente.superficie === "papel" ? "rgba(20,24,22,.1)" : "rgba(236,245,238,.13)";
      ctx.fill("evenodd");
      ctx.beginPath();
      contorno();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.6, (elegida ? 0.36 : 0.26) * e);
      ctx.setLineDash([Math.max(6, 1.6 * e), Math.max(4, 1 * e)]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (a.tipo === "rect") {
        const lado = Math.max(6, 0.9 * e);
        ctx.fillStyle = color;
        for (const q of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
          ctx.beginPath();
          ctx.roundRect(q[0] - lado / 2, q[1] - lado / 2, lado, lado, lado * 0.18);
          ctx.fill();
        }
      }
      ctx.restore();
      return;
    }
    ctx.beginPath();
    contorno();
    if (a.estilo === "translucida") {
      const velo = ctx.createLinearGradient(0, y0, 0, y1);
      velo.addColorStop(0, rgba(color, 0.26));
      velo.addColorStop(1, rgba(color, 0.12));
      ctx.fillStyle = velo;
      ctx.fill();
    } else if (a.estilo === "rayas") {
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = rgba(color, 0.55);
      ctx.lineWidth = Math.max(2, 0.3 * e);
      const paso = Math.max(7, 1.1 * e);
      for (let k = x0 - (y1 - y0); k < x1; k += paso) { ctx.beginPath(); ctx.moveTo(k, y1); ctx.lineTo(k + (y1 - y0), y0); ctx.stroke(); }
      ctx.restore();
    }
    ctx.strokeStyle = a.estilo === "borde" ? color : rgba(color, 0.75);
    ctx.lineWidth = Math.max(1.5, (elegida ? 0.36 : 0.24) * e);
    if (a.estilo !== "borde") ctx.setLineDash([Math.max(6, 1.4 * e), Math.max(4, 0.9 * e)]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (elegida) {
      // Elegida, sus cuatro esquinas: de ahí se estira.
      const lado = Math.max(7, 0.7 * e);
      ctx.fillStyle = o.acento;
      ctx.strokeStyle = this.halo(o);
      ctx.lineWidth = 1.5;
      for (const [qx, qy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
        ctx.beginPath();
        ctx.roundRect(qx - lado / 2, qy - lado / 2, lado, lado, lado * 0.2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** «20 × 20 m» en una pastilla, en el borde de arriba de la zona tal como se ve. */
  private pintarRotuloDeZona(tr: Transformacion, a: Extract<Anotacion, { tipo: "rect" | "zona" }>, color: string, o: Opciones) {
    const ctx = this.ctx;
    const esquinas = [a.a, { x: a.b.x, z: a.a.z }, a.b, { x: a.a.x, z: a.b.z }].map((q) => tr.aPantalla(q));
    const x = (Math.min(...esquinas.map((q) => q.x)) + Math.max(...esquinas.map((q) => q.x))) / 2, y = Math.min(...esquinas.map((q) => q.y));
    const texto = rotuloDeZona(a.a, a.b, o.metros);
    const alto = Math.max(15, Math.min(24, 1.3 * tr.escala));
    ctx.save();
    ctx.font = `800 ${alto * 0.58}px ${o.fuente}`;
    const ancho = ctx.measureText(texto).width + alto * 0.8;
    ctx.fillStyle = this.halo(o);
    ctx.beginPath();
    ctx.roundRect(x - ancho / 2 - 1.5, y - alto / 2 - 1.5, ancho + 3, alto + 3, alto / 2 + 1.5);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - ancho / 2, y - alto / 2, ancho, alto, alto / 2);
    ctx.fill();
    ctx.fillStyle = tintaSobre(color);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, x, y + alto * 0.04);
    ctx.restore();
  }

  /** Lo que mide una ficha en metros en esta escala, para empezar y acabar los trazos en su borde. */
  private radioEnMetros(e: number) {
    return radioEnPantalla(e, this.radioMinimo) / e;
  }

  /**
   * Una flecha: recta o curva, continua, discontinua, punteada u ondulada,
   * con punta, doble punta, barra o nada, y su grosor. Si está pegada a una
   * ficha, empieza o acaba en su borde y va con ella cuando se mueve.
   */
  private pintarFlecha(tr: Transformacion, a: Extract<Anotacion, { tipo: "flecha" }>, fase: Fase, color: string, o: Opciones, elegida: boolean) {
    const ctx = this.ctx, e = tr.escala, halo = this.halo(o);
    const lineal = o.ambiente.suavizado === "lineal";
    const ext = extremosDe(a, fase, this.t, lineal);
    const factor = FACTOR_GROSOR[a.grosor ?? "normal"];
    const grosor = Math.max(1.6, (elegida ? 0.42 : 0.32) * e) * factor;
    const cabeza = Math.max(10, 1.6 * e) * (0.75 + 0.25 * factor);
    const extremo: Extremo = a.extremo ?? (a.estilo === "linea" ? "nada" : "punta");
    const radio = this.radioEnMetros(e) * e * 1.12;
    const crudo = puntosDeFlecha(ext.a, ext.b, a.estilo === "presion" ? 0 : a.curva ?? 0, 32).map((q) => tr.aPantalla(q));
    const linea = recortar(crudo, ext.enFichaA ? radio : 0, ext.enFichaB ? radio : 0);
    const A = linea[0], B = linea[linea.length - 1];
    if (Math.hypot(B.x - A.x, B.y - A.y) < 2) return;
    if (a.estilo === "presion") {
      // La cuña de la presión: estrecha en quien aprieta, abierta hacia el balón.
      const largo = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / largo, uy = (B.y - A.y) / largo;
      const abre = Math.max(10, Math.min(largo * 0.35, 4 * e));
      ctx.save();
      ctx.globalAlpha *= 0.28;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x - uy * abre, B.y + ux * abre);
      ctx.lineTo(B.x + uy * abre, B.y - ux * abre);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      this.conHalo(o, grosor, color, () => {
        ctx.beginPath();
        ctx.moveTo(A.x, A.y); ctx.lineTo(B.x - uy * abre, B.y + ux * abre);
        ctx.moveTo(A.x, A.y); ctx.lineTo(B.x + uy * abre, B.y - ux * abre);
      });
      return;
    }
    // La línea acaba bajo la punta, no en su vértice: así la punta queda limpia.
    const conPuntaFin = extremo === "punta" || extremo === "doble", conPuntaIni = extremo === "doble";
    let trazo = recortar(linea, conPuntaIni ? cabeza * 0.6 : 0, conPuntaFin ? cabeza * 0.6 : 0);
    if (a.estilo === "ondulada") trazo = ondular(trazo, Math.max(14, 2.4 * e), Math.max(3, 0.45 * e));
    if (a.estilo === "discontinua") ctx.setLineDash([Math.max(5, 0.9 * e), Math.max(5, 0.75 * e)]);
    if (a.estilo === "punteada") ctx.setLineDash([0.1, Math.max(5, grosor * 2.4)]);
    this.conHalo(o, grosor, color, () => {
      ctx.beginPath();
      trazo.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    });
    ctx.setLineDash([]);
    const antes = (lista: Px[], desdeElFinal: boolean) => {
      // La dirección de la punta: unos píxeles atrás, para que en una curva mire hacia donde llega.
      const orden = desdeElFinal ? [...lista].reverse() : lista;
      const fin = orden[0];
      return orden.find((q) => Math.hypot(q.x - fin.x, q.y - fin.y) > cabeza * 0.8) ?? orden[orden.length - 1];
    };
    if (conPuntaFin) this.punta(antes(linea, true), B, cabeza, color, halo);
    if (conPuntaIni) this.punta(antes(linea, false), A, cabeza, color, halo);
    if (extremo === "barra") {
      // La barra de parada: hasta aquí y no más.
      const previo = antes(linea, true), l = Math.hypot(B.x - previo.x, B.y - previo.y) || 1;
      const nx = -(B.y - previo.y) / l, ny = (B.x - previo.x) / l, mitad = cabeza * 0.55;
      this.conHalo(o, grosor * 1.15, color, () => {
        ctx.beginPath();
        ctx.moveTo(B.x - nx * mitad, B.y - ny * mitad);
        ctx.lineTo(B.x + nx * mitad, B.y + ny * mitad);
      });
    }
  }

  /** Dibuja con el lienzo guardado y restaurado, y los trazos redondeados. */
  private conAlfa(dibujar: () => void, alfa = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    dibujar();
    ctx.restore();
  }

  /**
   * Una medida: la línea fina con sus topes y la distancia en metros en medio,
   * como en un análisis de la tele. `parte` deja pintar la línea bajo los
   * jugadores y la cifra encima.
   */
  private pintarMedida(tr: Transformacion, a: Extract<Anotacion, { tipo: "medida" }>, fase: Fase, color: string, o: Opciones, elegida: boolean, parte: "todo" | "linea" | "rotulo" = "todo") {
    const ctx = this.ctx, e = tr.escala;
    const ext = extremosDe(a, fase, this.t, o.ambiente.suavizado === "lineal");
    const metros = distancia(ext.a, ext.b);
    if (metros < 0.05) return;
    const radio = this.radioEnMetros(e) * e * 1.05;
    const [A, B] = recortar([tr.aPantalla(ext.a), tr.aPantalla(ext.b)], ext.enFichaA ? radio : 0, ext.enFichaB ? radio : 0);
    const l = Math.hypot(B.x - A.x, B.y - A.y) || 1, nx = -(B.y - A.y) / l, ny = (B.x - A.x) / l;
    const tope = Math.max(5, 0.55 * e), grosor = Math.max(1.4, (elegida ? 0.22 : 0.15) * e);
    if (parte !== "rotulo") {
      this.conHalo(o, grosor, color, () => {
        ctx.beginPath();
        ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
        ctx.moveTo(A.x - nx * tope, A.y - ny * tope); ctx.lineTo(A.x + nx * tope, A.y + ny * tope);
        ctx.moveTo(B.x - nx * tope, B.y - ny * tope); ctx.lineTo(B.x + nx * tope, B.y + ny * tope);
      });
    }
    if (parte === "linea") return;
    const texto = (o.metros ?? metrosPorDefecto)(metros);
    const alto = Math.max(15, Math.min(26, 1.5 * e));
    ctx.font = `800 ${alto * 0.58}px ${o.fuente}`;
    const ancho = ctx.measureText(texto).width + alto * 0.8;
    const c = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    ctx.fillStyle = this.halo(o);
    ctx.beginPath();
    ctx.roundRect(c.x - ancho / 2 - 1.5, c.y - alto / 2 - 1.5, ancho + 3, alto + 3, alto / 2 + 1.5);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(c.x - ancho / 2, c.y - alto / 2, ancho, alto, alto / 2);
    ctx.fill();
    ctx.fillStyle = tintaSobre(color);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, c.x, c.y + alto * 0.04);
  }

  /**
   * El bloque: la sombra de su espacio (hacia la portería que defienden o
   * alrededor de ellos) y una línea gruesa que pasa por los jugadores. Va con
   * ellos: se calcula en cada cuadro desde donde están.
   */
  private pintarBloque(tr: Transformacion, a: Extract<Anotacion, { tipo: "bloque" }>, jugada: Jugada, fase: Fase, color: string, o: Opciones, elegida: boolean) {
    const ctx = this.ctx, e = tr.escala, lineal = o.ambiente.suavizado === "lineal";
    const linea = lineaDeBloque(a, fase, this.t, lineal).map((q) => tr.aPantalla(q));
    if (!linea.length) return;
    const sombra = sombraDeBloque(a, jugada, fase, this.t, lineal).map((q) => tr.aPantalla(q));
    if (sombra.length >= 3) {
      ctx.beginPath();
      sombra.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      if (a.relleno === "atras") {
        // Más intensa junto a la línea y apagándose hacia la portería.
        const cx = linea.reduce((s, q) => s + q.x, 0) / linea.length, cy = linea.reduce((s, q) => s + q.y, 0) / linea.length;
        const lejos = sombra.slice(linea.length);
        const fx = lejos.reduce((s, q) => s + q.x, 0) / lejos.length, fy = lejos.reduce((s, q) => s + q.y, 0) / lejos.length;
        const velo = ctx.createLinearGradient(cx, cy, fx, fy);
        velo.addColorStop(0, rgba(color, 0.3));
        velo.addColorStop(1, rgba(color, 0.03));
        ctx.fillStyle = velo;
        ctx.fill();
      } else {
        ctx.fillStyle = rgba(color, 0.11);
        ctx.fill();
        ctx.strokeStyle = rgba(color, 0.7);
        ctx.lineWidth = Math.max(1.4, 0.2 * e);
        ctx.setLineDash([Math.max(6, 1.2 * e), Math.max(4, 0.8 * e)]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (a.relleno === "cerrado") return;
    const grosor = Math.max(2.4, (elegida ? 0.5 : 0.4) * e);
    if (linea.length === 1) {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(linea[0].x, linea[0].y, grosor, 0, Math.PI * 2); ctx.fill();
      return;
    }
    this.conHalo(o, grosor, color, () => {
      ctx.beginPath();
      linea.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    });
  }

  /** Un trazo a mano alzada, suavizado con curvas por los puntos medios. */
  private pintarTrazo(tr: Transformacion, puntos: Punto[], color: string, o: Opciones, elegida: boolean, grosor: Grosor, punta: boolean) {
    const ctx = this.ctx, e = tr.escala;
    const px = puntos.map((q) => tr.aPantalla(q));
    if (px.length < 2) return;
    const ancho = Math.max(1.6, (elegida ? 0.4 : 0.3) * e) * FACTOR_GROSOR[grosor];
    const cabeza = Math.max(10, 1.5 * e) * (0.75 + 0.25 * FACTOR_GROSOR[grosor]);
    const linea = punta ? recortar(px, 0, cabeza * 0.6) : px;
    this.conHalo(o, ancho, color, () => {
      ctx.beginPath();
      ctx.moveTo(linea[0].x, linea[0].y);
      for (let i = 1; i < linea.length - 1; i += 1) {
        const m = { x: (linea[i].x + linea[i + 1].x) / 2, y: (linea[i].y + linea[i + 1].y) / 2 };
        ctx.quadraticCurveTo(linea[i].x, linea[i].y, m.x, m.y);
      }
      ctx.lineTo(linea[linea.length - 1].x, linea[linea.length - 1].y);
    });
    if (punta) {
      const fin = px[px.length - 1];
      const previo = [...px].reverse().find((q) => Math.hypot(q.x - fin.x, q.y - fin.y) > cabeza * 0.8) ?? px[0];
      this.punta(previo, fin, cabeza, color, this.halo(o));
    }
  }

  /** Al arrastrar una ficha: la línea de la ficha con la que se alinea, de lado a lado del campo. */
  private pintarGuia(tr: Transformacion, o: Opciones) {
    const b = this.borrador;
    if (b?.tipo !== "guia") return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = rgba(o.acento, 0.85);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    if (b.x !== undefined) {
      const p = tr.aPantalla({ x: b.x, z: -MEDIO_A - 2 }), q = tr.aPantalla({ x: b.x, z: MEDIO_A + 2 });
      ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    }
    if (b.z !== undefined) {
      const p = tr.aPantalla({ x: -MEDIO_L - 2, z: b.z }), q = tr.aPantalla({ x: MEDIO_L + 2, z: b.z });
      ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Los jugadores que ya van en el bloque que se está formando: un aro del color de acento. */
  private pintarElegidosDeBloque(tr: Transformacion, fichas: string[], fase: Fase, o: Opciones, lineal: boolean) {
    const ctx = this.ctx, r = radioEnPantalla(tr.escala, this.radioMinimo);
    ctx.save();
    ctx.strokeStyle = o.acento;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    for (const id of fichas) {
      const p = posicionEn(fase, id, this.t, lineal);
      if (!p) continue;
      const c = tr.aPantalla(p);
      ctx.beginPath(); ctx.arc(c.x, c.y, r + 5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  private pintarBorrador(tr: Transformacion, o: Opciones) {
    const b = this.borrador, fase = this.fase, jugada = this.jugada;
    if (!b || !fase || !jugada || b.tipo === "guia") return;
    if (b.tipo === "bloque") {
      if (b.fichas.length) this.pintarAnotacion(tr, { id: "borrador", tipo: "bloque", fichas: b.fichas, color: o.colorAnotacion, relleno: b.relleno }, o, false, 0.75);
      return;
    }
    if (b.tipo === "trazo") {
      this.pintarAnotacion(tr, { id: "borrador", tipo: "trazo", puntos: b.puntos, color: o.colorAnotacion, grosor: b.grosor, punta: b.punta }, o, false, 0.8);
      return;
    }
    if (b.tipo === "medida") {
      this.pintarAnotacion(tr, { id: "borrador", tipo: "medida", a: b.a, b: b.b, color: o.colorAnotacion, desde: b.desde, hasta: b.hasta }, o, false, 0.85);
      return;
    }
    if (b.tipo === "marco") {
      // El recuadro de la selección: discontinuo, del color de acento, con un velo muy suave.
      const ctx = this.ctx, A = tr.aPantalla(b.a), B = tr.aPantalla(b.b);
      ctx.save();
      ctx.fillStyle = rgba(o.acento, 0.08);
      ctx.strokeStyle = o.acento;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.fillRect(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.abs(B.x - A.x), Math.abs(B.y - A.y));
      ctx.strokeRect(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.abs(B.x - A.x), Math.abs(B.y - A.y));
      ctx.restore();
      return;
    }
    if (b.tipo === "material") {
      if (b.material) for (const m of filaDeMaterial(b.material.tipo, b.a, b.b, b.material.separacion, b.material.slalom, b.material.color)) this.pintarMaterial(tr, m, o, false, 0.6);
      return;
    }
    if (b.tipo === "carrera") {
      const ficha = jugada.fichas.find((f) => f.id === b.fichaId);
      this.pintarCarrera(tr, b.a, b.b, 0, ficha ? this.colorDe(ficha.equipo, ficha.rol, o) : o.acento, o, 0.6);
    } else if (b.tipo === "pase") {
      this.pintarPase(tr, b.a, b.b, alturaDePase(b.a, { hasta: b.b, tipo: b.envio ?? "aereo" }), o, 0.6);
    } else {
      const provisional: Anotacion = b.tipo === "flecha"
        ? { id: "borrador", tipo: "flecha", a: b.a, b: b.b, color: o.colorAnotacion, estilo: b.estilo ?? "continua", extremo: b.extremo, grosor: b.grosor, desde: b.desde, hasta: b.hasta }
        : { id: "borrador", tipo: b.tipo, a: b.a, b: b.b, color: o.colorAnotacion, estilo: "translucida" };
      this.pintarAnotacion(tr, provisional, o, false, 0.7);
    }
  }
}
