/**
 * La escena 3D del cuaderno de balón parado, en three.js puro.
 *
 * No usa React por dentro: la pantalla le pasa la jugada, la fase y el
 * instante, y la escena dibuja. Separado así, reproducir una jugada mueve las
 * fichas sesenta veces por segundo sin volver a pintar el inspector, y la
 * pantalla sigue siendo la dueña del estado.
 *
 * Se carga con import() solo al abrir el cuaderno: three.js pesa más que todo
 * lo demás junto y nadie lo necesita para hacer un informe.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { CAMPO, balonEn, enCurva, posicionEn, type Anotacion, type Fase, type Jugada, type Punto } from "@/lib/abp";

export type Vista = "tactica" | "3d" | "cenital";
export type Seleccion = { tipo: "ficha" | "anotacion"; id: string } | null;
/** Lo que se está dibujando con el puntero, antes de soltar. */
export type Borrador = { tipo: "flecha" | "rect" | "zona" | "carrera" | "pase"; a: Punto; b: Punto; fichaId?: string } | null;
export type Opciones = {
  colorLocal: string;
  colorRival: string;
  colorAnotacion: string;
  acento: string;
  nombres: boolean;
  grada: boolean;
  fuente: string;
  /** El rol tal como se enseña (traducido si es uno de los de serie). */
  rotulo: (rol: string) => string;
};

const FONDO = "#08080a";
const LARGO = CAMPO.largo, ANCHO = CAMPO.ancho;
const MEDIO_L = LARGO / 2, MEDIO_A = ANCHO / 2;
const RADIO_FICHA = 0.85;

/** Blanco o casi negro, lo que se lea mejor sobre `fondo`. */
function tintaSobre(fondo: string) {
  const c = new THREE.Color(fondo);
  const luz = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return luz > 0.55 ? "#0b0b0e" : "#ffffff";
}

function rgba(hex: string, alfa: number) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alfa})`;
}

export class EscenaABP {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.5, 600);
  private controls: OrbitControls;
  private fijo = new THREE.Group();
  private grada = new THREE.Group();
  private dinamico = new THREE.Group();
  private materialesDeLinea = new Set<LineMaterial>();
  private fichas = new Map<string, THREE.Group>();
  private balon: THREE.Mesh;
  private sombraBalon: THREE.Mesh;
  private observador: ResizeObserver;
  private sucio = true;
  private animacion = 0;
  /** Un viaje de cámara en curso: de dónde sale, a dónde va y cuándo empezó. */
  private destino: { pos0: THREE.Vector3; mira0: THREE.Vector3; pos: THREE.Vector3; mira: THREE.Vector3; inicio: number } | null = null;
  private fase: Fase | null = null;
  private plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private rayo = new THREE.Raycaster();
  private acentoGrada = "";
  private vistaActual: Vista = "tactica";
  /**
   * Los rótulos y dorsales ya dibujados. Arrastrar una ficha vuelve a montar
   * la fase en cada movimiento; sin esto se pintarían cuarenta lienzos por
   * cuadro para escribir los mismos números.
   */
  private texturas = new Map<string, THREE.CanvasTexture>();

  constructor(private contenedor: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "abp-lienzo";
    contenedor.appendChild(this.canvas);

    this.scene.background = new THREE.Color(FONDO);
    this.scene.fog = new THREE.Fog(FONDO, 140, 260);
    this.scene.add(this.fijo, this.grada, this.dinamico);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x1a221d, 1.25));
    const sol = new THREE.DirectionalLight(0xffffff, 1.5);
    sol.position.set(25, 70, 35);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    const sc = sol.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 50; sc.bottom = -50; sc.near = 10; sc.far = 160;
    sol.shadow.bias = -0.0005;
    this.scene.add(sol);

    this.construirCampo();

    this.balon = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }));
    this.balon.castShadow = true;
    this.sombraBalon = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    this.scene.add(this.balon, this.sombraBalon);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 190;
    this.controls.screenSpacePanning = false;
    this.controls.addEventListener("change", () => { this.sucio = true; });
    this.controls.addEventListener("start", () => { this.destino = null; });

    this.observador = new ResizeObserver(() => this.ajustarTamano());
    this.observador.observe(contenedor);
    this.ajustarTamano();
    this.vista("tactica", null, true);

    const bucle = () => {
      this.animacion = requestAnimationFrame(bucle);
      if (this.destino) {
        // Por tiempo y no por cuadro: dura lo mismo en un portátil que en un móvil lento.
        const d = this.destino;
        const k = Math.min(1, (performance.now() - d.inicio) / 650);
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
        this.camera.position.lerpVectors(d.pos0, d.pos, e);
        this.controls.target.lerpVectors(d.mira0, d.mira, e);
        if (k >= 1) this.destino = null;
        this.sucio = true;
      }
      this.controls.update();
      if (this.sucio) {
        this.sucio = false;
        this.renderer.render(this.scene, this.camera);
      }
    };
    bucle();
  }

  /** Bloquea el giro de cámara mientras se dibuja con el puntero. */
  set orbitar(activo: boolean) {
    this.controls.enabled = activo;
  }

  destruir() {
    cancelAnimationFrame(this.animacion);
    this.observador.disconnect();
    this.controls.dispose();
    this.vaciar(this.dinamico);
    this.vaciar(this.fijo);
    this.vaciar(this.grada);
    for (const t of this.texturas.values()) t.dispose();
    this.texturas.clear();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private ajustarTamano() {
    const { clientWidth: w, clientHeight: h } = this.contenedor;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Line2 mide el grosor en píxeles CSS: la resolución va sin la densidad de pantalla.
    for (const m of this.materialesDeLinea) m.resolution.set(w, h);
    this.sucio = true;
  }

  /** Renderiza ya, sin esperar al siguiente cuadro: para capturar la imagen justo después. */
  renderizarAhora() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // ---- El punto del césped bajo el puntero ------------------------------------------------

  puntoDelCampo(clienteX: number, clienteY: number): Punto | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clienteX - r.left) / r.width) * 2 - 1, -((clienteY - r.top) / r.height) * 2 + 1);
    this.rayo.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.rayo.ray.intersectPlane(this.plano, p)) return null;
    return { x: p.x, z: p.z };
  }

  // ---- Cámaras ------------------------------------------------------------------------------

  /**
   * Las tres vistas. Táctica: todo el campo desde la grada, como una
   * televisión alta. 3D: cerca de la jugada, desde atrás y a un lado.
   * Cenital: la pizarra de siempre, desde arriba.
   */
  vista(vista: Vista, centro: Punto | null, inmediato = false) {
    this.vistaActual = vista;
    const aspecto = Math.max(this.camera.aspect, 0.5);
    const tanMedia = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    let pos: THREE.Vector3, mira: THREE.Vector3;
    if (vista === "cenital") {
      // Que quepa el campo entero con un margen, a lo ancho y a lo alto.
      const alto = Math.max((ANCHO + 8) / 2, (LARGO + 8) / 2 / aspecto) / tanMedia;
      pos = new THREE.Vector3(0, alto, 0.01);
      mira = new THREE.Vector3(0, 0, 0);
    } else if (vista === "3d") {
      const c = centro ?? { x: 0, z: 0 };
      const hacia = new THREE.Vector3(-Math.sign(c.x || 1) * 1, 0, 0.75).normalize();
      mira = new THREE.Vector3(c.x, 0, c.z);
      pos = mira.clone().addScaledVector(hacia, 30).add(new THREE.Vector3(0, 17, 0));
    } else {
      // Lejos y alto, como la cámara principal de una retransmisión: entra el campo entero y la grada de este lado.
      const lejos = Math.max(100, ((LARGO + 10) / 2 / aspecto) / tanMedia * 1.12);
      mira = new THREE.Vector3(0, 0, 4);
      pos = new THREE.Vector3(0, lejos * 0.72, lejos * 0.7);
    }
    if (inmediato) {
      this.camera.position.copy(pos);
      this.controls.target.copy(mira);
      this.destino = null;
    } else {
      this.viajar(pos, mira);
    }
    this.sucio = true;
  }

  private viajar(pos: THREE.Vector3, mira: THREE.Vector3) {
    this.destino = { pos0: this.camera.position.clone(), mira0: this.controls.target.clone(), pos, mira, inicio: performance.now() };
  }

  /** Acerca la cámara a lo que pasa en la fase: las fichas que se mueven, el balón y su destino. */
  centrar(puntos: Punto[]) {
    if (!puntos.length) return this.vista(this.vistaActual, null);
    const xs = puntos.map((p) => p.x), zs = puntos.map((p) => p.z);
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
    const radio = Math.max(12, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2);
    const mira = new THREE.Vector3(c.x, 0, c.z);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const lejos = radio / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 1.15;
    this.viajar(mira.clone().addScaledVector(dir, lejos), mira);
    this.sucio = true;
  }

  // ---- Lo fijo: el campo, las porterías y la grada ---------------------------------------

  private construirCampo() {
    const escala = 20; // px por metro en la textura
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round((LARGO + 6) * escala);
    lienzo.height = Math.round((ANCHO + 6) * escala);
    const ctx = lienzo.getContext("2d")!;
    const X = (x: number) => (x + MEDIO_L + 3) * escala, Z = (z: number) => (z + MEDIO_A + 3) * escala;
    // Césped segado a franjas, muy oscuro: el césped no compite con las fichas.
    ctx.fillStyle = "#0c1511";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    const franjas = 14;
    for (let i = 0; i < franjas; i += 1) {
      ctx.fillStyle = i % 2 ? "#0f1b15" : "#0d1712";
      ctx.fillRect(X(-MEDIO_L + (LARGO / franjas) * i), Z(-MEDIO_A), (LARGO / franjas) * escala + 1, ANCHO * escala);
    }
    ctx.strokeStyle = "rgba(255,255,255,.82)";
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.lineWidth = 0.13 * escala;
    const rect = (x0: number, z0: number, x1: number, z1: number) => ctx.strokeRect(X(x0), Z(z0), (x1 - x0) * escala, (z1 - z0) * escala);
    const arco = (x: number, z: number, r: number, a0 = 0, a1 = Math.PI * 2) => { ctx.beginPath(); ctx.arc(X(x), Z(z), r * escala, a0, a1); ctx.stroke(); };
    const punto = (x: number, z: number) => { ctx.beginPath(); ctx.arc(X(x), Z(z), 0.22 * escala, 0, Math.PI * 2); ctx.fill(); };
    rect(-MEDIO_L, -MEDIO_A, MEDIO_L, MEDIO_A);
    ctx.beginPath(); ctx.moveTo(X(0), Z(-MEDIO_A)); ctx.lineTo(X(0), Z(MEDIO_A)); ctx.stroke();
    arco(0, 0, 9.15);
    punto(0, 0);
    for (const lado of [-1, 1]) {
      const fondo = lado * MEDIO_L;
      rect(Math.min(fondo, fondo - lado * 16.5), -20.16, Math.max(fondo, fondo - lado * 16.5), 20.16);
      rect(Math.min(fondo, fondo - lado * 5.5), -9.16, Math.max(fondo, fondo - lado * 5.5), 9.16);
      punto(fondo - lado * 11, 0);
      // La media luna: solo el trozo de fuera del área.
      const dentro = Math.acos(5.5 / 9.15);
      if (lado > 0) arco(fondo - 11, 0, 9.15, Math.PI - dentro, Math.PI + dentro);
      else arco(fondo + 11, 0, 9.15, -dentro, dentro);
      for (const banda of [-1, 1]) {
        const a0 = lado > 0 ? (banda < 0 ? Math.PI / 2 : Math.PI) : (banda < 0 ? 0 : -Math.PI / 2);
        arco(fondo, banda * MEDIO_A, 1, a0, a0 + Math.PI / 2);
      }
    }
    const textura = new THREE.CanvasTexture(lienzo);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const cesped = new THREE.Mesh(new THREE.PlaneGeometry(LARGO + 6, ANCHO + 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: textura, roughness: 1, metalness: 0 }));
    cesped.receiveShadow = true;
    const fuera = new THREE.Mesh(new THREE.PlaneGeometry(LARGO + 40, ANCHO + 36).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0a0f0c, roughness: 1 }));
    fuera.position.y = -0.02;
    fuera.receiveShadow = true;
    this.fijo.add(fuera, cesped);
    for (const lado of [-1, 1]) this.fijo.add(this.porteria(lado));
  }

  private porteria(lado: number) {
    const g = new THREE.Group();
    const blanco = new THREE.MeshStandardMaterial({ color: 0xf5f5f7, roughness: 0.4 });
    const poste = new THREE.CylinderGeometry(0.06, 0.06, 2.44, 10);
    for (const z of [-3.66, 3.66]) {
      const p = new THREE.Mesh(poste, blanco);
      p.position.set(0, 1.22, z);
      p.castShadow = true;
      g.add(p);
    }
    const larguero = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7.32, 10).rotateX(Math.PI / 2), blanco);
    larguero.position.set(0, 2.44, 0);
    larguero.castShadow = true;
    g.add(larguero);
    // La red: una retícula tenue, que se intuya sin tapar lo que hay detrás.
    const fondo = 1.8, caida = 2.0, puntos: number[] = [];
    for (let z = -3.66; z <= 3.661; z += 0.45) puntos.push(0, 2.44, z, fondo, caida, z, fondo, caida, z, fondo, 0, z);
    for (let y = 0; y <= caida + 0.001; y += 0.45) puntos.push(fondo, y, -3.66, fondo, y, 3.66);
    for (const z of [-3.66, 3.66]) for (let x = 0; x <= fondo + 0.001; x += 0.45) puntos.push(x, 0, z, x, 2.44 - (x / fondo) * (2.44 - caida), z);
    const red = new THREE.BufferGeometry();
    red.setAttribute("position", new THREE.Float32BufferAttribute(puntos, 3));
    g.add(new THREE.LineSegments(red, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })));
    g.position.x = lado * MEDIO_L;
    g.scale.x = lado;
    return g;
  }

  /** La grada: gradas en talud con franjas del color del espacio, como el resto de la plataforma. */
  private construirGrada(acento: string) {
    this.vaciar(this.grada);
    this.acentoGrada = acento;
    const lienzo = document.createElement("canvas");
    lienzo.width = 64; lienzo.height = 256;
    const ctx = lienzo.getContext("2d")!;
    ctx.fillStyle = "#101014";
    ctx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 16; i += 1) {
      ctx.fillStyle = i % 3 === 0 ? rgba(acento, 0.75) : i % 3 === 1 ? rgba(acento, 0.32) : "#16161b";
      ctx.fillRect(0, i * 16, 64, 9);
    }
    const textura = new THREE.CanvasTexture(lienzo);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
    const lados: Array<{ largo: number; x: number; z: number; giro: number }> = [
      { largo: LARGO + 24, x: 0, z: -(MEDIO_A + 9), giro: 0 },
      { largo: LARGO + 24, x: 0, z: MEDIO_A + 9, giro: Math.PI },
      { largo: ANCHO + 18, x: -(MEDIO_L + 10), z: 0, giro: Math.PI / 2 },
      { largo: ANCHO + 18, x: MEDIO_L + 10, z: 0, giro: -Math.PI / 2 },
    ];
    for (const lado of lados) {
      const t = textura.clone();
      t.repeat.set(lado.largo / 8, 1);
      t.needsUpdate = true;
      const talud = new THREE.Mesh(new THREE.PlaneGeometry(lado.largo, 16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));
      talud.rotation.x = -Math.PI / 2 + 0.62;
      const pieza = new THREE.Group();
      pieza.add(talud);
      talud.position.set(0, 4.6, -6.2);
      pieza.position.set(lado.x, 0, lado.z);
      pieza.rotation.y = lado.giro;
      this.grada.add(pieza);
    }
  }

  // ---- Lo que cambia: fichas, recorridos y anotaciones ----------------------------------

  private vaciar(grupo: THREE.Object3D) {
    grupo.traverse((o) => {
      const malla = o as THREE.Mesh;
      if (malla.geometry) malla.geometry.dispose();
      const materiales = malla.material ? (Array.isArray(malla.material) ? malla.material : [malla.material]) : [];
      for (const m of materiales) {
        const conMapa = m as THREE.MeshBasicMaterial;
        if (!conMapa.map?.userData.cache) conMapa.map?.dispose();
        if (m instanceof LineMaterial) this.materialesDeLinea.delete(m);
        m.dispose();
      }
    });
    grupo.clear();
  }

  private linea(puntos: THREE.Vector3[], color: string, ancho: number, discontinua = false, opacidad = 1) {
    const geo = new LineGeometry();
    geo.setPositions(puntos.flatMap((p) => [p.x, p.y, p.z]));
    const mat = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: ancho, dashed: discontinua, dashSize: 0.9, gapSize: 0.6, transparent: opacidad < 1, opacity: opacidad, worldUnits: false });
    mat.resolution.copy(this.renderer.getSize(new THREE.Vector2()));
    this.materialesDeLinea.add(mat);
    const l = new Line2(geo, mat);
    l.computeLineDistances();
    return l;
  }

  /** Una punta de flecha plana sobre el césped, apuntando de `de` a `a`. */
  private punta(de: Punto, a: Punto, color: string, tamano = 1.5, y = 0.07, opacidad = 1) {
    const forma = new THREE.Shape();
    forma.moveTo(0, 0);
    forma.lineTo(-tamano, tamano * 0.42);
    forma.lineTo(-tamano * 0.78, 0);
    forma.lineTo(-tamano, -tamano * 0.42);
    forma.closePath();
    const malla = new THREE.Mesh(new THREE.ShapeGeometry(forma).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: opacidad < 1, opacity: opacidad, side: THREE.DoubleSide, depthWrite: false }));
    malla.position.set(a.x, y, a.z);
    malla.rotation.y = Math.atan2(-(a.z - de.z), a.x - de.x);
    return malla;
  }

  private enCache(clave: string, crear: () => HTMLCanvasElement) {
    let t = this.texturas.get(clave);
    if (!t) {
      t = new THREE.CanvasTexture(crear());
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.userData.cache = true;
      this.texturas.set(clave, t);
    }
    return t;
  }

  private rotuloSprite(texto: string, opciones: { color: string; fondo?: string; alto: number; peso?: number; fuente: string }) {
    const clave = ["rotulo", texto, opciones.color, opciones.fondo ?? "", opciones.peso ?? 700, opciones.fuente].join("|");
    const textura = this.enCache(clave, () => this.lienzoDeRotulo(texto, opciones));
    const { width, height } = textura.image as HTMLCanvasElement;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, depthWrite: false, transparent: true }));
    sprite.scale.set((opciones.alto * width) / height, opciones.alto, 1);
    return sprite;
  }

  private lienzoDeRotulo(texto: string, opciones: { color: string; fondo?: string; peso?: number; fuente: string }) {
    const px = 96;
    const lienzo = document.createElement("canvas");
    const ctx = lienzo.getContext("2d")!;
    const fuente = `${opciones.peso ?? 700} ${px}px ${opciones.fuente}`;
    ctx.font = fuente;
    const relleno = opciones.fondo ? px * 0.42 : px * 0.12;
    lienzo.width = Math.ceil(ctx.measureText(texto).width + relleno * 2);
    lienzo.height = Math.ceil(px * (opciones.fondo ? 1.5 : 1.3));
    ctx.font = fuente;
    if (opciones.fondo) {
      ctx.fillStyle = opciones.fondo;
      const r = lienzo.height / 2;
      ctx.beginPath();
      ctx.roundRect(0, 0, lienzo.width, lienzo.height, r);
      ctx.fill();
    } else {
      ctx.shadowColor = "rgba(0,0,0,.85)";
      ctx.shadowBlur = px * 0.18;
    }
    ctx.fillStyle = opciones.color;
    ctx.textBaseline = "middle";
    ctx.fillText(texto, relleno, lienzo.height / 2 + px * 0.04);
    return lienzo;
  }

  private dorsalTextura(dorsal: string, fondo: string, fuente: string) {
    return this.enCache(["dorsal", dorsal, fondo, fuente].join("|"), () => this.lienzoDeDorsal(dorsal, fondo, fuente));
  }

  private lienzoDeDorsal(dorsal: string, fondo: string, fuente: string) {
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = 128;
    const ctx = lienzo.getContext("2d")!;
    ctx.fillStyle = fondo;
    ctx.beginPath(); ctx.arc(64, 64, 64, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tintaSobre(fondo);
    ctx.font = `800 ${dorsal.length > 2 ? 46 : 62}px ${fuente}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(dorsal, 64, 68);
    return lienzo;
  }

  private ficha(dorsal: string, rol: string, color: string, opciones: Opciones, seleccionada: boolean) {
    const g = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(RADIO_FICHA, RADIO_FICHA * 1.04, 0.34, 40), new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05 }));
    cuerpo.position.y = 0.17;
    cuerpo.castShadow = true;
    const tapa = new THREE.Mesh(new THREE.CircleGeometry(RADIO_FICHA * 0.98, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.dorsalTextura(dorsal, color, opciones.fuente) }));
    tapa.position.y = 0.345;
    // El aro blanco que la despega del césped oscuro.
    const aro = new THREE.Mesh(new THREE.RingGeometry(RADIO_FICHA * 1.02, RADIO_FICHA * 1.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    aro.position.y = 0.02;
    g.add(cuerpo, tapa, aro);
    if (seleccionada) {
      const sel = new THREE.Mesh(new THREE.RingGeometry(RADIO_FICHA * 1.45, RADIO_FICHA * 1.75, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: opciones.acento, depthWrite: false }));
      sel.position.y = 0.03;
      g.add(sel);
    }
    if (opciones.nombres && rol.trim()) {
      const nombre = this.rotuloSprite(opciones.rotulo(rol).toUpperCase(), { color: "#ffffff", alto: 0.62, peso: 700, fuente: opciones.fuente });
      nombre.position.y = 1.4;
      g.add(nombre);
    }
    return g;
  }

  private anotacion(a: Anotacion, opciones: Opciones, seleccionada: boolean, opacidad = 1) {
    const g = new THREE.Group();
    const color = a.color || opciones.colorAnotacion;
    if (!("b" in a)) {
      const sprite = a.tipo === "etiqueta"
        ? this.rotuloSprite(a.texto || "·", { color: tintaSobre(color), fondo: color, alto: 1.5, peso: 700, fuente: opciones.fuente })
        : this.rotuloSprite(a.texto || "·", { color, alto: 2.1, peso: 800, fuente: opciones.fuente });
      sprite.position.set(a.a.x, a.tipo === "etiqueta" ? 1.1 : 1.3, a.a.z);
      (sprite.material as THREE.SpriteMaterial).opacity = opacidad;
      g.add(sprite);
      if (seleccionada) {
        const marca = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: opciones.acento, depthWrite: false }));
        marca.position.set(a.a.x, 0.04, a.a.z);
        g.add(marca);
      }
      return g;
    }
    const y = 0.06;
    if (a.tipo === "flecha") {
      const largo = Math.hypot(a.b.x - a.a.x, a.b.z - a.a.z) || 1;
      const recorte = Math.min(1.1, largo * 0.4);
      const fin = { x: a.b.x - ((a.b.x - a.a.x) / largo) * recorte, z: a.b.z - ((a.b.z - a.a.z) / largo) * recorte };
      g.add(this.linea([new THREE.Vector3(a.a.x, y, a.a.z), new THREE.Vector3(fin.x, y, fin.z)], color, seleccionada ? 6 : 4, false, opacidad));
      g.add(this.punta(a.a, a.b, color, 1.8, y + 0.01, opacidad));
      return g;
    }
    const x0 = Math.min(a.a.x, a.b.x), x1 = Math.max(a.a.x, a.b.x), z0 = Math.min(a.a.z, a.b.z), z1 = Math.max(a.a.z, a.b.z);
    const ancho = Math.max(x1 - x0, 0.2), alto = Math.max(z1 - z0, 0.2);
    const borde: THREE.Vector3[] = [];
    if (a.tipo === "rect") {
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]) borde.push(new THREE.Vector3(x, y + 0.01, z));
    } else {
      for (let i = 0; i <= 72; i += 1) {
        const ang = (i / 72) * Math.PI * 2;
        borde.push(new THREE.Vector3((x0 + x1) / 2 + Math.cos(ang) * ancho / 2, y + 0.01, (z0 + z1) / 2 + Math.sin(ang) * alto / 2));
      }
    }
    if (a.estilo !== "borde") {
      const geo = a.tipo === "rect" ? new THREE.PlaneGeometry(ancho, alto) : new THREE.CircleGeometry(0.5, 72).scale(ancho, alto, 1);
      geo.rotateX(-Math.PI / 2);
      let material: THREE.MeshBasicMaterial;
      if (a.estilo === "rayas") {
        const lienzo = document.createElement("canvas");
        lienzo.width = lienzo.height = 64;
        const ctx = lienzo.getContext("2d")!;
        ctx.strokeStyle = rgba(color, 0.55);
        ctx.lineWidth = 12;
        for (let k = -64; k <= 128; k += 32) { ctx.beginPath(); ctx.moveTo(k, 64); ctx.lineTo(k + 64, 0); ctx.stroke(); }
        const t = new THREE.CanvasTexture(lienzo);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(ancho / 2.2, alto / 2.2);
        t.colorSpace = THREE.SRGBColorSpace;
        material = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: opacidad, depthWrite: false });
      } else {
        material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.24 * opacidad, depthWrite: false });
      }
      const relleno = new THREE.Mesh(geo, material);
      relleno.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      g.add(relleno);
    }
    g.add(this.linea(borde, color, seleccionada ? 5 : 3, false, opacidad));
    return g;
  }

  private carrera(desde: Punto, hasta: Punto, curva: number, color: string, opacidad = 1) {
    const g = new THREE.Group();
    const largo = Math.hypot(hasta.x - desde.x, hasta.z - desde.z);
    if (largo < 0.3) return g;
    // La línea empieza en el borde de la ficha y acaba en la base de la punta.
    const puntos: THREE.Vector3[] = [];
    const tIni = Math.min(0.45, (RADIO_FICHA * 1.25) / largo), tFin = Math.max(tIni, 1 - Math.min(0.4, 1.1 / largo));
    for (let i = 0; i <= 40; i += 1) {
      const t = tIni + ((tFin - tIni) * i) / 40;
      const p = enCurva(desde, hasta, curva, t);
      puntos.push(new THREE.Vector3(p.x, 0.06, p.z));
    }
    g.add(this.linea(puntos, color, 3, true, opacidad));
    const antes = enCurva(desde, hasta, curva, 0.96);
    g.add(this.punta(antes, hasta, color, 1.4, 0.07, opacidad));
    return g;
  }

  private pase(desde: Punto, fase: Fase, color: string, opacidad = 1) {
    const g = new THREE.Group();
    if (!fase.pase) return g;
    const aire: THREE.Vector3[] = [], suelo: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i += 1) {
      const p = balonEn({ ...fase, balon: desde }, i / 48);
      // El aéreo se dibuja a la altura del centro del balón; el raso, pegado al césped.
      aire.push(new THREE.Vector3(p.x, fase.pase.tipo === "aereo" ? 0.36 + p.y : 0.08, p.z));
      suelo.push(new THREE.Vector3(p.x, 0.05, p.z));
    }
    g.add(this.linea(aire, color, 3.2, false, opacidad));
    if (fase.pase.tipo === "aereo") g.add(this.linea(suelo, color, 1.5, true, 0.3 * opacidad));
    const fin = aire[aire.length - 1], previo = aire[aire.length - 4];
    const cono = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 16), new THREE.MeshBasicMaterial({ color, transparent: opacidad < 1, opacity: opacidad }));
    cono.position.copy(fin);
    cono.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fin.clone().sub(previo).normalize());
    g.add(cono);
    return g;
  }

  /**
   * Dibuja la fase: las fichas en su sitio de partida, sus carreras, el pase
   * y las anotaciones. Se llama al cambiar la jugada, la fase o la selección;
   * para moverlas en el tiempo está `instante`.
   */
  montar(jugada: Jugada, indice: number, opciones: Opciones, seleccion: Seleccion, borrador: Borrador) {
    if (opciones.acento !== this.acentoGrada) this.construirGrada(opciones.acento);
    this.grada.visible = opciones.grada;
    this.vaciar(this.dinamico);
    this.fichas.clear();
    const fase = jugada.fases[Math.min(indice, jugada.fases.length - 1)];
    this.fase = fase;
    const colorDe = (equipo: "local" | "rival") => (equipo === "local" ? opciones.colorLocal : opciones.colorRival);

    for (const a of fase.anotaciones) {
      this.dinamico.add(this.anotacion(a, opciones, seleccion?.tipo === "anotacion" && seleccion.id === a.id));
    }
    for (const c of fase.carreras) {
      const ficha = jugada.fichas.find((f) => f.id === c.fichaId);
      const desde = fase.pos[c.fichaId];
      if (ficha && desde) this.dinamico.add(this.carrera(desde, c.hasta, c.curva, colorDe(ficha.equipo)));
    }
    this.dinamico.add(this.pase(fase.balon, fase, "#ffffff"));

    for (const f of jugada.fichas) {
      const sitio = fase.pos[f.id];
      if (!sitio) continue;
      // El portero, en un tono propio: se distingue de un vistazo como en la tele.
      const color = /^(portero|gk|goalkeeper)$/i.test(f.rol.trim()) ? (f.equipo === "local" ? "#f3b64c" : "#45c6ba") : colorDe(f.equipo);
      const g = this.ficha(f.dorsal, f.rol, color, opciones, seleccion?.tipo === "ficha" && seleccion.id === f.id);
      g.position.set(sitio.x, 0, sitio.z);
      this.fichas.set(f.id, g);
      this.dinamico.add(g);
    }

    if (borrador) {
      const b = borrador;
      if (b.tipo === "carrera") {
        const ficha = jugada.fichas.find((f) => f.id === b.fichaId);
        this.dinamico.add(this.carrera(b.a, b.b, 0, ficha ? colorDe(ficha.equipo) : opciones.acento, 0.6));
      } else if (b.tipo === "pase") {
        this.dinamico.add(this.pase(b.a, { ...fase, balon: b.a, pase: { hasta: b.b, tipo: fase.pase?.tipo ?? "aereo" } }, "#ffffff", 0.6));
      } else {
        const provisional: Anotacion = b.tipo === "flecha"
          ? { id: "borrador", tipo: "flecha", a: b.a, b: b.b, color: opciones.colorAnotacion }
          : { id: "borrador", tipo: b.tipo, a: b.a, b: b.b, color: opciones.colorAnotacion, estilo: "translucida" };
        this.dinamico.add(this.anotacion(provisional, opciones, false, 0.7));
      }
    }
    this.instante(0);
  }

  /** Coloca fichas y balón en el instante `t` (0–1) de la fase montada. */
  instante(t: number) {
    const fase = this.fase;
    if (!fase) return;
    for (const [id, g] of this.fichas) {
      const p = posicionEn(fase, id, t);
      if (p) g.position.set(p.x, 0, p.z);
    }
    const b = balonEn(fase, t);
    this.balon.position.set(b.x, 0.36 + b.y, b.z);
    this.sombraBalon.position.set(b.x, 0.015, b.z);
    const escala = 1 / (1 + b.y * 0.12);
    this.sombraBalon.scale.set(escala, 1, escala);
    (this.sombraBalon.material as THREE.MeshBasicMaterial).opacity = 0.45 * escala;
    this.sucio = true;
  }

  /** La imagen de lo que se ve ahora, para descargar o meter en el PDF. */
  capturar(tipo: "image/png" | "image/jpeg" = "image/png", calidad = 0.92) {
    this.renderizarAhora();
    return this.canvas.toDataURL(tipo, calidad);
  }
}
