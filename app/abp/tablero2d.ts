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
  CAJA_DE_ENCUADRE, CAMPO, alturaDePase, balonEn, enCurva, posicionEn, suavizar, type Anotacion, type Encuadre, type Fase, type Jugada, type Punto,
} from "@/lib/abp";
import { abreviar, cajaDe, camaraDeCaja, interpolarCamara, transformacion, type Camara, type Transformacion } from "@/lib/tablero";
import { SUPERFICIE, luz, rgba, tintaSobre } from "./temas";
import type { Borrador, Motor, Opciones, Seleccion, Vista } from "./motor";

const MEDIO_L = CAMPO.largo / 2, MEDIO_A = CAMPO.ancho / 2;
/** El radio de una ficha, en metros: algo más grande que un jugador, para leerse en un móvil. */
const RADIO = 1.6;
/**
 * En pantalla la ficha no pasa de 21 px ni baja de 11 (en las fotos pequeñas
 * de la tira y la biblioteca, de menos): al acercarse crece un poco, pero sobre
 * todo los jugadores se separan, que es para lo que se hace zoom.
 */
const radioEnPantalla = (escala: number, minimo = 11) => Math.max(minimo, Math.min(21, RADIO * escala));

/** Un color más oscuro, para el borde de la cúpula de una ficha. */
function oscurecer(hex: string, factor: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = (v: number) => Math.round(v * factor).toString(16).padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
const VIAJE_MS = 750;

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

  centrar(puntos: Punto[]) {
    if (!puntos.length) return this.viajar(this.camaraDeEncuadre());
    this.viajar(camaraDeCaja(cajaDe(puntos), this.ancho, this.alto, this.orientacion));
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
      for (const a of fase.anotaciones) if ((a.tipo === "rect" || a.tipo === "zona") && a.estilo !== "foco") this.pintarAnotacion(tr, a, o, this.esElegida(a.id));
      // El foco va encima de las zonas y debajo de flechas y fichas: apaga el césped de fuera, no a los jugadores.
      for (const a of fase.anotaciones) if ((a.tipo === "rect" || a.tipo === "zona") && a.estilo === "foco") this.pintarAnotacion(tr, a, o, this.esElegida(a.id));
      for (const a of fase.anotaciones) if (a.tipo === "flecha") this.pintarAnotacion(tr, a, o, this.esElegida(a.id));
      for (const c of fase.carreras) {
        const ficha = jugada.fichas.find((f) => f.id === c.fichaId);
        const desde = fase.pos[c.fichaId];
        if (ficha && desde) this.pintarCarrera(tr, desde, c.hasta, c.curva, this.colorDe(ficha.equipo, ficha.rol, o), o);
      }
      if (fase.pase) this.pintarPase(tr, fase.balon, fase.pase.hasta, alturaDePase(fase.balon, fase.pase), o, 1);
      if (o.ambiente.estelas && this.t > 0) this.pintarEstelas(tr, fase, jugada, o, lineal);
      this.pintarBorrador(tr, o);
      for (const f of jugada.fichas) {
        const p = posicionEn(fase, f.id, this.t, lineal);
        if (p) this.pintarFicha(tr, p, f.dorsal, f.rol, this.colorDe(f.equipo, f.rol, o), o, this.seleccion?.tipo === "ficha" && this.seleccion.id === f.id);
      }
      this.pintarBalon(tr, balonEn(fase, this.t), o);
      for (const a of fase.anotaciones) if (a.tipo === "texto" || a.tipo === "etiqueta") this.pintarAnotacion(tr, a, o, this.esElegida(a.id));
    }
    ctx.restore();
  }

  private esElegida(id: string) {
    return this.seleccion?.tipo === "anotacion" && this.seleccion.id === id;
  }

  /** El color de la ficha; el portero, en un tono propio como en el 3D. */
  private colorDe(equipo: "local" | "rival", rol: string, o: Opciones) {
    if (/^(portero|por|gk|goalkeeper)$/i.test(rol.trim())) return equipo === "local" ? "#f3b64c" : "#45c6ba";
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

  private pintarCarrera(tr: Transformacion, desde: Punto, hasta: Punto, curva: number, color: string, o: Opciones, alfa = 1) {
    const ctx = this.ctx, e = tr.escala;
    const largo = Math.hypot(hasta.x - desde.x, hasta.z - desde.z);
    if (largo < 0.3) return;
    const tIni = Math.min(0.45, (radioEnPantalla(e, this.radioMinimo) * 1.1) / e / largo), tFin = Math.max(tIni, 1 - Math.min(0.4, 1 / largo));
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
    for (const c of fase.carreras) {
      const ficha = jugada.fichas.find((f) => f.id === c.fichaId);
      const desde = fase.pos[c.fichaId];
      if (!ficha || !desde) continue;
      const color = this.trazoDe(this.colorDe(ficha.equipo, ficha.rol, o), o);
      estela((u) => enCurva(desde, c.hasta, c.curva, suavizar(u, lineal)), color);
    }
    if (fase.pase) {
      const altura = alturaDePase(fase.balon, fase.pase);
      const tinta = SUPERFICIE[o.ambiente.superficie].aro;
      estela((u) => balonEn(fase, u), tinta, (u) => altura * 4 * u * (1 - u) * 0.55 * e);
    }
  }

  /**
   * Una ficha con relieve: la sombra de contacto en el césped, la cúpula con la
   * luz arriba a la izquierda, un aro oscuro por dentro y otro claro por fuera,
   * y un brillo. Así se separa del césped sin sombras borrosas.
   */
  private pintarFicha(tr: Transformacion, p: Punto, dorsal: string, rol: string, color: string, o: Opciones, elegida: boolean) {
    const ctx = this.ctx, e = tr.escala, tema = SUPERFICIE[o.ambiente.superficie];
    const c = tr.aPantalla(p), r = radioEnPantalla(e, this.radioMinimo);
    const nombre = o.rotulo(rol);
    const dentro = o.ambiente.fichas === "puesto" && nombre.trim() ? abreviar(nombre) : dorsal;
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
    // La cúpula: la luz entra por arriba a la izquierda y el borde se oscurece.
    const cupula = ctx.createRadialGradient(c.x - r * 0.28, c.y - r * 0.44, 0, c.x - r * 0.28, c.y - r * 0.44, r * 1.64);
    cupula.addColorStop(0, color);
    cupula.addColorStop(0.76, oscurecer(color, 0.8));
    cupula.addColorStop(1, oscurecer(color, 0.8));
    ctx.fillStyle = cupula;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = "rgba(0,0,0,.26)";
    ctx.lineWidth = r * 0.13;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.98, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = papel && luz(color) > 0.78 ? "#6b6f76" : rgba(tema.aro, 0.88);
    ctx.lineWidth = Math.max(1.2, r * 0.1);
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
    ctx.fillStyle = tintaSobre(color);
    ctx.font = `900 ${r * (dentro.length > 2 ? 0.7 : 0.86)}px ${o.fuente}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(dentro, c.x, c.y + r * 0.05);
    // El rol debajo, en una píldora que se lee en cualquier césped.
    const debajo = o.nombres && nombre.trim() && (o.ambiente.fichas === "dorsal" || nombre.trim().length > 3) ? nombre.toUpperCase() : "";
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

  private pintarAnotacion(tr: Transformacion, a: Anotacion, o: Opciones, elegida: boolean, alfa = 1) {
    const ctx = this.ctx, e = tr.escala;
    const color = this.trazoDe(a.color || o.colorAnotacion, o);
    const halo = this.halo(o);
    ctx.save();
    ctx.globalAlpha = alfa;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (!("b" in a)) {
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
    const A = tr.aPantalla(a.a), B = tr.aPantalla(a.b);
    if (a.tipo === "flecha") {
      const grosor = Math.max(2, (elegida ? 0.42 : 0.32) * e);
      const largo = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      const ux = (B.x - A.x) / largo, uy = (B.y - A.y) / largo;
      const cabeza = Math.max(11, 1.6 * e);
      if (a.estilo === "presion") {
        // La cuña de la presión: estrecha en quien aprieta, abierta hacia el balón.
        const abre = Math.max(10, Math.min(largo * 0.35, 4 * e));
        ctx.globalAlpha = alfa * 0.28;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x - uy * abre, B.y + ux * abre);
        ctx.lineTo(B.x + uy * abre, B.y - ux * abre);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = alfa;
        this.conHalo(o, grosor, color, () => {
          ctx.beginPath();
          ctx.moveTo(A.x, A.y); ctx.lineTo(B.x - uy * abre, B.y + ux * abre);
          ctx.moveTo(A.x, A.y); ctx.lineTo(B.x + uy * abre, B.y - ux * abre);
        });
      } else {
        const fin = a.estilo === "linea" ? B : { x: B.x - ux * cabeza * 0.6, y: B.y - uy * cabeza * 0.6 };
        if (a.estilo === "discontinua") ctx.setLineDash([Math.max(5, 0.9 * e), Math.max(5, 0.75 * e)]);
        this.conHalo(o, grosor, color, () => {
          ctx.beginPath();
          if (a.estilo === "ondulada") {
            // La conducción: el balón pegado al pie, en zigzag suave.
            const tramo = Math.hypot(fin.x - A.x, fin.y - A.y), ondas = Math.max(2, Math.round(tramo / Math.max(14, 2.4 * e))), pasos = ondas * 12;
            for (let i = 0; i <= pasos; i += 1) {
              const k = i / pasos, amp = Math.max(3, 0.45 * e) * Math.sin(k * ondas * Math.PI * 2) * Math.min(1, k * 6, (1 - k) * 6);
              const x = A.x + (fin.x - A.x) * k - uy * amp, y = A.y + (fin.y - A.y) * k + ux * amp;
              if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
            }
          } else {
            ctx.moveTo(A.x, A.y);
            ctx.lineTo(fin.x, fin.y);
          }
        });
        ctx.setLineDash([]);
        if (a.estilo !== "linea") this.punta(A, B, cabeza, color, halo);
      }
      ctx.restore();
      return;
    }
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
    ctx.restore();
  }

  private pintarBorrador(tr: Transformacion, o: Opciones) {
    const b = this.borrador, fase = this.fase, jugada = this.jugada;
    if (!b || !fase || !jugada) return;
    if (b.tipo === "carrera") {
      const ficha = jugada.fichas.find((f) => f.id === b.fichaId);
      this.pintarCarrera(tr, b.a, b.b, 0, ficha ? this.colorDe(ficha.equipo, ficha.rol, o) : o.acento, o, 0.6);
    } else if (b.tipo === "pase") {
      const tipo = fase.pase?.tipo ?? "aereo";
      this.pintarPase(tr, b.a, b.b, alturaDePase(b.a, { hasta: b.b, tipo }), o, 0.6);
    } else {
      const provisional: Anotacion = b.tipo === "flecha"
        ? { id: "borrador", tipo: "flecha", a: b.a, b: b.b, color: o.colorAnotacion, estilo: b.estilo ?? "continua" }
        : { id: "borrador", tipo: b.tipo, a: b.a, b: b.b, color: o.colorAnotacion, estilo: "translucida" };
      this.pintarAnotacion(tr, provisional, o, false, 0.7);
    }
  }
}
