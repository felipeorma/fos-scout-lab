"use client";

import { useEffect, useMemo, useState } from "react";
import { t, tf } from "@/lib/i18n";
import { aggregateDatasets, extractSeason, type DataRow, type SourceDataset } from "@/lib/scouting";
import { positionSides } from "@/lib/positions";
import { LogoPlataforma } from "./LogosPlataforma";
import { buildSimilaritySearch, playerPassports, similarityOptions, type SimilarityFilters } from "@/lib/similarity";
import {
  fetchSkillcornerCompetitions,
  fetchSkillcornerDataset,
  fetchStatsbombCompetitions,
  fetchStatsbombDataset,
  temporadasUtiles,
  type ApiCompetition,
} from "@/lib/remoteData";

/**
 * Buscador entre ligas.
 *
 * Las demás pantallas trabajan sobre una base cargada. Esta arma un fondo con
 * varias competiciones de la API a la vez y busca ahí dentro: "quién se parece
 * a este jugador en cualquiera de las ligas que tenemos".
 *
 * Dos cuidados que no son cosméticos:
 *
 * - **Años comparables.** Comparar un 2024 con un 2026 mezcla al jugador con
 *   su propia evolución. No se prohíbe —a veces es lo que hay— pero se avisa
 *   en cuanto lo elegido abarca más de un año. Ojo: "2026" y "2026/2027" son
 *   el mismo año de arranque, así que una liga de año calendario y una de año
 *   cruzado sí se pueden juntar.
 * - **Cobertura desigual.** No todas las ligas traen las mismas métricas: unas
 *   tienen game intelligence de SkillCorner y otras no. El motor descarta por
 *   candidato las métricas que le faltan, y aquí se muestra el porcentaje de
 *   cobertura de cada uno para que un 95% con tres métricas no se lea igual
 *   que un 88% con doce.
 *
 * Lo que esta pantalla NO hace: ajustar por nivel de liga. Un 90 en Ligue 3 no
 * es un 90 en la MLS, y el descuento por rating de Opta que usa la mesa de
 * Maldonado está atado a sus seis ligas. Por eso la liga de cada candidato va
 * en su propia columna, bien visible, en vez de esconderse en un promedio.
 */


/**
 * Parecido corregido por cobertura.
 *
 * Sin esto el buscador miente de forma sistemática. Un candidato de una liga
 * con pocas métricas se compara en menos dimensiones, y menos dimensiones son
 * menos ocasiones de diferir: en una prueba con dos ligas idénticas salvo por
 * la cobertura, los de la liga pobre salían al 100% con 67% de cobertura, por
 * encima de los de la liga rica que coincidían en todo al 96%. El buscador
 * empujaba hacia las ligas de las que menos se sabe, que es justo lo contrario
 * de lo que uno quiere al fichar.
 *
 * La corrección es un encogimiento hacia la media: el parecido de un candidato
 * pesa según cuántas métricas lo sostienen, y lo que falta se rellena con el
 * parecido medio del conjunto. Con cobertura completa no cambia nada; con
 * media docena de métricas el número se acerca a la media hasta que haya
 * evidencia que lo separe de ella.
 */
const METRICAS_PARA_CONFIAR = 8;

function conCobertura<T extends { similarity: number; coverage: number }>(candidatos: T[], totalMetricas: number) {
  if (!candidatos.length) return [];
  const media = candidatos.reduce((suma, c) => suma + c.similarity, 0) / candidatos.length;
  return candidatos.map((candidato) => {
    const usadas = Math.max(0, Math.round((candidato.coverage / 100) * totalMetricas));
    const ajustado = (usadas * candidato.similarity + METRICAS_PARA_CONFIAR * media) / (usadas + METRICAS_PARA_CONFIAR);
    return { ...candidato, ajustado: Math.round(ajustado) };
  }).sort((a, b) => b.ajustado - a.ajustado || b.coverage - a.coverage);
}

type Fuente = "statsbomb" | "skillcorner";

/**
 * El año de arranque de una temporada: 2026 tanto en "2026" como en
 * "2026/2027". Las ligas de año calendario y las de año cruzado nombran
 * distinto el mismo periodo, y antes eso las dejaba en grupos incompatibles:
 * no había forma de poner la MLS junto a la Ligue 3 aunque se solapen.
 */
function anioDe(temporada: string) {
  const m = String(temporada).match(/\d{4}/);
  return m ? Number(m[0]) : 0;
}

/**
 * La edición de SkillCorner que corresponde a una competición de StatsBomb.
 *
 * Se emparejan por nombre y temporada, que es lo único que comparten las dos
 * plataformas: no hay identificador común. El nombre se compara sin acentos
 * ni mayúsculas, y la temporada tal cual, porque las dos la escriben igual
 * cuando cubren la misma competición.
 *
 * SkillCorner nunca es la base: entra como capa encima, igual que al cargar
 * una sola liga. Lo que aporta son las métricas de game intelligence y las
 * físicas, que es justo lo que da de sí el buscador entre ligas.
 */
const sinTildes = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function ediciónHermana(competicion: ApiCompetition, ediciones: ApiCompetition[]) {
  const nombre = sinTildes(competicion.name ?? "");
  const temporada = String(competicion.season ?? "");
  return ediciones.find((e) => sinTildes(e.name ?? "") === nombre && String(e.season ?? "") === temporada) ?? null;
}

/**
 * Cómo se nombra la base cargada en el filtro de liga.
 *
 * Su nombre es el del archivo —"StatsBomb · Canadian Premier League 2026" o el
 * Excel de Wyscout que sea—, y puesto tal cual en el desplegable de ligas
 * parecía una competición más, escrita distinto que todas las demás. Se le
 * quita el proveedor y se dice lo que es: la base con la que se abrió la
 * sesión, que puede ser una liga que ya está en el fondo o una que solo existe
 * en un Excel.
 */
function etiquetaDeLaBase(nombre: string) {
  return `${t("Base cargada")} · ${nombre.replace(/^(StatsBomb|SkillCorner|Wyscout)\s*·\s*/i, "").trim() || nombre}`;
}

function claveDe(fuente: Fuente, competicion: ApiCompetition) {
  return fuente === "statsbomb"
    ? `sb:${competicion.competition_id}:${competicion.season_id}`
    : `sc:${competicion.id}`;
}

export function PoolPage({ baseCargada, onAbrirInforme }: {
  /** La base del informe, para poder buscar parecidos a un jugador propio. */
  baseCargada?: { nombre: string; rows: DataRow[] } | null;
  /**
   * Abrir la ficha de un jugador del fondo. Recibe las bases con las que se
   * armó, no solo el índice: el fondo es un conjunto distinto del informe, y
   * usar el índice contra la base cargada abriría a otro jugador. Quien
   * recibe esto vuelve a combinar las mismas bases, así que el índice vale.
   */
  onAbrirInforme?: (bases: SourceDataset[], indice: number) => void;
}) {
  const [fuente, setFuente] = useState<Fuente>("statsbomb");
  const [competiciones, setCompeticiones] = useState<Record<Fuente, ApiCompetition[]>>({ statsbomb: [], skillcorner: [] });
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [incluirBase, setIncluirBase] = useState(true);
  const [enlazarSc, setEnlazarSc] = useState(true);
  /** Las que entraron con una temporada anterior porque la actual aún no tiene
   *  partidos publicados. Se dice, porque mezcla años sin haberlo pedido. */
  const [rezagadas, setRezagadas] = useState<string[]>([]);

  const [fondo, setFondo] = useState<DataRow[] | null>(null);
  const [basesDelFondo, setBasesDelFondo] = useState<SourceDataset[]>([]);
  const [progreso, setProgreso] = useState("");
  const [cargando, setCargando] = useState(false);
  const [fallos, setFallos] = useState<string[]>([]);

  /** De qué liga y año viene cada fila del fondo, para poder filtrar el
   *  resultado sin volver a cargar nada. Se arma al cruzar las bases. */
  const [procedencias, setProcedencias] = useState<{ archivo: string; liga: string; anio: number }[]>([]);

  const [objetivo, setObjetivo] = useState(-1);
  const [busqueda, setBusqueda] = useState("");
  const [minutosMin, setMinutosMin] = useState(600);
  const [edadMax, setEdadMax] = useState(0);
  const [posicion, setPosicion] = useState("");
  const [pasaporte, setPasaporte] = useState("");
  const [clubesFuera, setClubesFuera] = useState<string[]>([]);
  const [ligaFiltro, setLigaFiltro] = useState("");
  const [anioFiltro, setAnioFiltro] = useState(0);
  const [mismoFlanco, setMismoFlanco] = useState(false);

  useEffect(() => {
    let montado = true;
    void Promise.all([
      fetchStatsbombCompetitions().catch(() => [] as ApiCompetition[]),
      fetchSkillcornerCompetitions().catch(() => [] as ApiCompetition[]),
    ]).then(([sb, sc]) => {
      if (!montado) return;
      setCompeticiones({ statsbomb: sb, skillcorner: sc });
      // Las ligas entran ya elegidas: llegar a esta pantalla y encontrar el
      // menú vacío obligaba a añadirlas de una en una antes de poder buscar
      // nada. Se quitan con un clic las que no interesen.
      const utiles = temporadasUtiles(sb);
      setElegidas(utiles.elegidas.map((competicion) => claveDe("statsbomb", competicion)));
      setRezagadas(utiles.rezagadas.map((competicion) => `${competicion.name} ${competicion.season}`));
      if (!sb.length && !sc.length) setProgreso(t("El servidor local no está corriendo. Arranca npm run bg:server y recarga."));
    });
    return () => { montado = false; };
  }, []);

  const disponibles = competiciones[fuente];

  /** Agrupadas por liga, con la temporada más reciente primero dentro de cada una. */
  const porLiga = useMemo(() => {
    const grupos = new Map<string, ApiCompetition[]>();
    for (const c of disponibles) {
      const nombre = c.country ? `${c.name} · ${c.country}` : c.name;
      grupos.set(nombre, [...(grupos.get(nombre) ?? []), c]);
    }
    return [...grupos.entries()]
      .map(([nombre, cs]) => ({
        nombre,
        entradas: [...cs].sort((a, b) => String(b.season).localeCompare(String(a.season), "en", { numeric: true })),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [disponibles]);

  const porClave = useMemo(() => {
    const mapa = new Map<string, ApiCompetition>();
    for (const c of disponibles) mapa.set(claveDe(fuente, c), c);
    return mapa;
  }, [disponibles, fuente]);

  /**
   * Cambiar de plataforma rehace la selección: las claves son de otro
   * proveedor y las anteriores ya no apuntan a nada. Va en el manejador y no
   * en un efecto porque es consecuencia de lo que hizo quien mira, no una
   * sincronización: en un efecto habría que distinguir este cambio del primer
   * render y de la llegada del catálogo, y cualquiera de las dos confusiones
   * borraría una selección hecha a mano.
   */
  function cambiarFuente(nueva: Fuente) {
    setFuente(nueva);
    const utiles = temporadasUtiles(competiciones[nueva]);
    setElegidas(utiles.elegidas.map((competicion) => claveDe(nueva, competicion)));
    setRezagadas(utiles.rezagadas.map((competicion) => `${competicion.name} ${competicion.season}`));
    setFondo(null);
    setObjetivo(-1);
  }

  /** Las competiciones de StatsBomb que además tienen edición en SkillCorner.
   *  Se marca en el menú porque cambia lo que se puede preguntar: con la capa
   *  física encima entran los datos de carrera y de game intelligence. */
  const conSkillcorner = useMemo(() => {
    const marcadas = new Set<string>();
    if (fuente !== "statsbomb") return marcadas;
    for (const competicion of competiciones.statsbomb) {
      if (ediciónHermana(competicion, competiciones.skillcorner)) marcadas.add(claveDe("statsbomb", competicion));
    }
    return marcadas;
  }, [competiciones, fuente]);

  const seleccionadas = useMemo(
    () => elegidas.map((clave) => porClave.get(clave)).filter(Boolean) as ApiCompetition[],
    [elegidas, porClave],
  );

  /** Años distintos entre lo elegido: un 2024 junto a un 2026 mezcla al
   *  jugador con su propia evolución, así que se avisa. */
  const aniosMezclados = useMemo(
    () => [...new Set(seleccionadas.map((c) => anioDe(String(c.season ?? ""))).filter(Boolean))].sort(),
    [seleccionadas],
  );

  function agregar(clave: string) {
    if (!clave) return;
    setElegidas((actuales) => (actuales.includes(clave) ? actuales : [...actuales, clave]));
  }

  function quitar(clave: string) {
    setElegidas((actuales) => actuales.filter((x) => x !== clave));
  }

  async function armarFondo() {
    const seleccion = seleccionadas;
    if (!seleccion.length) return;
    setCargando(true);
    setFallos([]);
    setFondo(null);
    setObjetivo(-1);

    const bases: SourceDataset[] = [];
    /** Etiqueta de cada base, para saber luego de dónde salió cada fila. */
    const marcas: { archivo: string; liga: string; anio: number }[] = [];
    const problemas: string[] = [];
    const enlazadas: string[] = [];
    if (incluirBase && baseCargada?.rows.length) {
      marcas.push({ archivo: baseCargada.nombre, liga: etiquetaDeLaBase(baseCargada.nombre), anio: anioDe(String(seleccion[0]?.season ?? "")) });
      bases.push({
        fileName: baseCargada.nombre,
        season: extractSeason(String(seleccion[0]?.season ?? "")),
        headers: Object.keys(baseCargada.rows[0]),
        rows: baseCargada.rows,
        provider: "wyscout",
      });
    }

    for (let i = 0; i < seleccion.length; i += 1) {
      const competicion = seleccion[i];
      setProgreso(tf("{n} de {total} · {liga}", { n: i + 1, total: seleccion.length, liga: competicion.name }));
      const anio = anioDe(String(competicion.season ?? ""));
      try {
        const base = fuente === "statsbomb"
          ? await fetchStatsbombDataset(competicion)
          : await fetchSkillcornerDataset(competicion);
        marcas.push({ archivo: base.fileName, liga: competicion.name, anio });
        bases.push(base);
      } catch (error) {
        problemas.push(`${competicion.name}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      // La capa de SkillCorner encima, si esa liga y temporada la tienen.
      if (fuente === "statsbomb" && enlazarSc) {
        const hermana = ediciónHermana(competicion, competiciones.skillcorner);
        if (hermana) {
          setProgreso(tf("{n} de {total} · {liga} · enlazando SkillCorner", { n: i + 1, total: seleccion.length, liga: competicion.name }));
          try {
            const capa = await fetchSkillcornerDataset(hermana);
            // La capa lleva la etiqueta de la liga que reviste, no la suya:
            // quien solo aparece en SkillCorner sigue siendo de esa liga.
            marcas.push({ archivo: capa.fileName, liga: competicion.name, anio });
            bases.push(capa);
            enlazadas.push(competicion.name);
          } catch {
            // Que falle la capa no invalida la base: se sigue sin ella.
            problemas.push(`${competicion.name} · SkillCorner: ${t("no se pudo enlazar")}`);
          }
        }
      }
    }

    try {
      if (!bases.length) throw new Error(t("Ninguna competición devolvió jugadores."));
      const combinado = aggregateDatasets(bases);
      setFondo(combinado.rows);
      setBasesDelFondo(bases);
      setProcedencias(marcas);
      setClubesFuera([]);
      setPasaporte("");
      setLigaFiltro("");
      setAnioFiltro(0);
      setMismoFlanco(false);
      setProgreso(enlazadas.length
        ? tf("{j} jugadores de {n} bases · SkillCorner enlazado en {e}", { j: combinado.rows.length, n: bases.length, e: enlazadas.join(", ") })
        : tf("{j} jugadores de {n} competiciones.", { j: combinado.rows.length, n: bases.length }));
    } catch (error) {
      setProgreso(error instanceof Error ? error.message : String(error));
    } finally {
      setFallos(problemas);
      setCargando(false);
    }
  }

  const opciones = useMemo(() => (fondo ? similarityOptions(fondo) : null), [fondo]);

  /** Los clubes del fondo, para poder descartar los inalcanzables. */
  const clubes = useMemo(
    () => (fondo
      ? [...new Set(fondo.map((fila) => String(fila.Team ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"))
      : []),
    [fondo],
  );

  /**
   * La liga y el año de cada fila del fondo.
   *
   * Al cruzar las bases cada jugador se queda con la columna "Data sources",
   * que nombra los archivos de los que salió. Como sabemos con qué liga y qué
   * año entró cada archivo, basta buscar el nombre dentro de esa cadena: es
   * exacto y no depende de separar por comas, que rompería con cualquier liga
   * que llevara una en el nombre.
   *
   * Un jugador puede tener dos ligas si cambió de competición dentro del año;
   * en ese caso vale con que una coincida con el filtro.
   */
  const origenPorFila = useMemo(() => {
    if (!fondo) return null;
    return fondo.map((fila) => {
      const fuentes = String(fila["Data sources"] ?? "");
      const ligas: string[] = [];
      const anios: number[] = [];
      for (const marca of procedencias) {
        if (!fuentes.includes(marca.archivo)) continue;
        if (!ligas.includes(marca.liga)) ligas.push(marca.liga);
        if (marca.anio && !anios.includes(marca.anio)) anios.push(marca.anio);
      }
      return { ligas, anios };
    });
  }, [fondo, procedencias]);

  const ligasDelFondo = useMemo(
    () => [...new Set(procedencias.map((marca) => marca.liga))].sort((a, b) => a.localeCompare(b, "es")),
    [procedencias],
  );
  const aniosDelFondo = useMemo(
    () => [...new Set(procedencias.map((marca) => marca.anio).filter(Boolean))].sort(),
    [procedencias],
  );

  /**
   * El flanco del jugador de referencia.
   *
   * "Mismo perfil de banda" solo tiene sentido cuando el jugador tiene uno:
   * un mediocentro es "center" y un extremo que juega por las dos bandas sale
   * con las dos, así que en esos casos la casilla se deshabilita en vez de
   * filtrar por algo que no significa nada.
   */
  const flancoObjetivo = useMemo<"" | "left" | "right">(() => {
    if (!fondo || objetivo < 0) return "";
    const lados = positionSides(fondo[objetivo].Position);
    const izquierda = lados.includes("left");
    const derecha = lados.includes("right");
    if (izquierda && !derecha) return "left";
    if (derecha && !izquierda) return "right";
    return "";
  }, [fondo, objetivo]);

  const candidatosObjetivo = useMemo(() => {
    if (!fondo || !busqueda.trim()) return [];
    const q = busqueda.trim().toLowerCase();
    return fondo
      .map((fila, indice) => ({ indice, nombre: String(fila.Player ?? ""), equipo: String(fila.Team ?? "") }))
      .filter((x) => x.nombre.toLowerCase().includes(q))
      .slice(0, 20);
  }, [fondo, busqueda]);

  const resultado = useMemo(() => {
    if (!fondo || objetivo < 0) return null;
    const filtros: SimilarityFilters = {
      query: "", position: posicion, secondaryRole: "",
      side: mismoFlanco ? flancoObjetivo : "",
      passport: pasaporte,
      minimumMinutes: minutosMin,
      ageMin: null, ageMax: edadMax > 0 ? edadMax : null,
    };
    return buildSimilaritySearch(fondo, objetivo, filtros);
  }, [fondo, objetivo, posicion, pasaporte, minutosMin, edadMax, mismoFlanco, flancoObjetivo]);

  const nombreObjetivo = objetivo >= 0 && fondo ? String(fondo[objetivo].Player ?? "") : "";
  const ordenados = useMemo(() => {
    if (!resultado) return [];
    /*
     * Primero se corrige por cobertura sobre TODOS los candidatos y solo
     * después se aplican los filtros de mercado —club descartado, liga, año—.
     * El orden importa: la corrección encoge hacia la media del conjunto, así
     * que si se filtrara antes, tachar un club movería el parecido de todos
     * los demás. Un filtro de mercado esconde jugadores; no puede reescribir
     * el número de los que quedan.
     */
    const todos = conCobertura(resultado.candidates, resultado.target.metrics.length);
    return todos
      .map((candidato) => ({ ...candidato, origen: origenPorFila?.[candidato.index] ?? { ligas: [], anios: [] } }))
      .filter((candidato) => {
        if (clubesFuera.includes(candidato.team)) return false;
        if (ligaFiltro && !candidato.origen.ligas.includes(ligaFiltro)) return false;
        if (anioFiltro && !candidato.origen.anios.includes(anioFiltro)) return false;
        return true;
      });
  }, [resultado, clubesFuera, ligaFiltro, anioFiltro, origenPorFila]);

  return <section className="pool-page">
    <header>
      <h2>{t("Buscador entre ligas")}</h2>
      <p>{t("Arma un fondo con varias competiciones de la API y busca dentro: quién se parece a un jugador, en cualquiera de las ligas contratadas. Una sola temporada por búsqueda, porque comparar dos años distintos mezcla al jugador con su propia evolución.")}</p>
    </header>

    {/* ---- 1. Qué entra en el fondo ---- */}
    <div className="pool-setup">
      <div className="pool-row">
        <label><span>{t("Plataforma")}</span>
          <select value={fuente} onChange={(event) => cambiarFuente(event.target.value as Fuente)}>
            <option value="statsbomb">StatsBomb</option>
            <option value="skillcorner">SkillCorner</option>
          </select>
        </label>
        <label><span>{t("Añadir liga y año")}</span>
          <select value="" onChange={(event) => { agregar(event.target.value); event.target.value = ""; }}>
            <option value="">{t("Elegir…")}</option>
            {porLiga.map((grupo) => (
              <optgroup key={grupo.nombre} label={grupo.nombre}>
                {grupo.entradas.map((competicion) => {
                  const clave = claveDe(fuente, competicion);
                  return <option key={clave} value={clave} disabled={elegidas.includes(clave)}>
                    {competicion.season}{conSkillcorner.has(clave) ? " · SkillCorner" : ""}{elegidas.includes(clave) ? " ✓" : ""}
                  </option>;
                })}
              </optgroup>
            ))}
          </select>
        </label>
        <button type="button" className="pool-load" disabled={cargando || !elegidas.length} onClick={() => void armarFondo()}>
          {cargando ? t("Armando el fondo…") : tf("Cargar {n} competiciones", { n: elegidas.length })}
        </button>
      </div>

      <div className="pool-atajos">
        <button type="button" onClick={() => {
          const utiles = temporadasUtiles(disponibles);
          setElegidas(utiles.elegidas.map((c) => claveDe(fuente, c)));
          setRezagadas(utiles.rezagadas.map((c) => `${c.name} ${c.season}`));
        }}>
          {t("Todas las de la temporada en curso")}
        </button>
        <button type="button" disabled={!elegidas.length} onClick={() => setElegidas([])}>{t("Vaciar")}</button>
        {conSkillcorner.size > 0 && <span>
          {tf("{n} de las elegidas tienen SkillCorner encima", {
            n: elegidas.filter((clave) => conSkillcorner.has(clave)).length,
          })}
        </span>}
      </div>

      {seleccionadas.length > 0 && <div className="pool-ligas">
        {seleccionadas.map((competicion) => {
          const clave = claveDe(fuente, competicion);
          return <button key={clave} type="button" className="on" onClick={() => quitar(clave)}
            title={t("Quitar del fondo")}>
            {competicion.name}<small>{competicion.season}</small>
            {/* Las marcas de lo que trae la liga: la plataforma que la sirve y,
                si la hay, la capa de SkillCorner encima. Se ve de un vistazo
                cuáles vienen con datos físicos y de game intelligence. */}
            <span className="pool-marcas">
              <LogoPlataforma plataforma={fuente} alto={12} />
              {conSkillcorner.has(clave) && <LogoPlataforma plataforma="skillcorner" alto={12} />}
            </span>
            <i>×</i>
          </button>;
        })}
      </div>}

      {rezagadas.length > 0 && <p className="pool-aviso-anios">
        {tf("Sin partidos publicados todavía en su temporada de este año, así que entran con la anterior: {ligas}. Es dato bueno, pero de un curso ya cerrado.", {
          ligas: rezagadas.join(", "),
        })}
      </p>}

      {aniosMezclados.length > 1 && <p className="pool-aviso-anios">
        {tf("Lo elegido abarca {anios}. Un jugador comparado consigo mismo entre dos años no dice lo que parece: el que creció sale parecido a su versión anterior. Úsalo a sabiendas.", {
          anios: aniosMezclados.join(", "),
        })}
      </p>}

      {fuente === "statsbomb" && <label className="pool-incluir">
        <input type="checkbox" checked={enlazarSc} onChange={(event) => setEnlazarSc(event.target.checked)} />
        <span>{t("Enlazar SkillCorner encima donde exista esa liga y temporada. Aporta game intelligence y datos físicos; tarda más en cargar.")}</span>
      </label>}

      {baseCargada?.rows.length ? <label className="pool-incluir">
        <input type="checkbox" checked={incluirBase} onChange={(event) => setIncluirBase(event.target.checked)} />
        <span>{tf("Incluir la base cargada ({n} jugadores) para poder buscar parecidos a un jugador propio", { n: baseCargada.rows.length })}</span>
      </label> : null}

      {progreso && <p className="pool-estado">{progreso}</p>}
      {fallos.length > 0 && <ul className="pool-fallos">
        {fallos.map((x) => <li key={x}>{x}</li>)}
      </ul>}
    </div>

    {/* ---- 2. A quién nos parecemos ---- */}
    {fondo && <div className="pool-buscar">
      <label><span>{t("Jugador de referencia")}</span>
        <input value={busqueda} placeholder={t("Escribe un nombre…")} onChange={(event) => setBusqueda(event.target.value)} />
      </label>
      {candidatosObjetivo.length > 0 && <div className="pool-sugerencias">
        {candidatosObjetivo.map((x) => (
          <button key={x.indice} type="button" className={x.indice === objetivo ? "on" : ""}
            onClick={() => { setObjetivo(x.indice); setBusqueda(x.nombre); }}>
            {x.nombre}<small>{x.equipo}</small>
          </button>
        ))}
      </div>}

      <div className="pool-filtros">
        <label><span>{t("Posición")}</span>
          <select value={posicion} onChange={(event) => setPosicion(event.target.value)}>
            <option value="">{t("La del jugador")}</option>
            {(opciones?.positions ?? []).map((x) => <option key={x} value={x}>{t(x)}</option>)}
          </select>
        </label>
        <label><span>{t("Mín. minutos")}</span>
          <input type="number" min="0" step="100" value={minutosMin} onChange={(event) => setMinutosMin(Number(event.target.value))} />
        </label>
        <label><span>{t("Edad máxima")}</span>
          <input type="number" min="0" max="45" value={edadMax || ""} placeholder="—" onChange={(event) => setEdadMax(Number(event.target.value))} />
        </label>
        <label><span>{t("Pasaporte")}</span>
          <select value={pasaporte} disabled={!opciones?.passports.length} onChange={(event) => setPasaporte(event.target.value)}>
            {opciones?.passports.length
              ? <>
                <option value="">{t("Todos")}</option>
                {opciones.passports.map((x) => <option key={x} value={x}>{x}</option>)}
              </>
              : <option value="">{t("La base no trae nacionalidad")}</option>}
          </select>
        </label>
        {ligasDelFondo.length > 1 && <label><span>{t("Liga")}</span>
          <select value={ligaFiltro} onChange={(event) => setLigaFiltro(event.target.value)}>
            <option value="">{t("Todas")}</option>
            {ligasDelFondo.map((liga) => <option key={liga} value={liga}>{liga}</option>)}
          </select>
        </label>}
        {aniosDelFondo.length > 1 && <label><span>{t("Año")}</span>
          <select value={anioFiltro || ""} onChange={(event) => setAnioFiltro(Number(event.target.value))}>
            <option value="">{t("Todos")}</option>
            {aniosDelFondo.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
          </select>
        </label>}
        <label><span>{t("Descartar club")}</span>
          <select
            value=""
            onChange={(event) => {
              const club = event.target.value;
              if (club) setClubesFuera((actuales) => (actuales.includes(club) ? actuales : [...actuales, club]));
              event.target.value = "";
            }}
          >
            <option value="">{t("+ Elegir club")}</option>
            {clubes.filter((x) => !clubesFuera.includes(x)).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
      </div>

      <label className={flancoObjetivo ? "pool-incluir" : "pool-incluir apagada"}>
        <input type="checkbox" checked={mismoFlanco && Boolean(flancoObjetivo)} disabled={!flancoObjetivo}
          onChange={(event) => setMismoFlanco(event.target.checked)} />
        <span>{flancoObjetivo
          ? tf("Solo jugadores del mismo flanco ({lado})", { lado: flancoObjetivo === "left" ? t("izquierda") : t("derecha") })
          : t("Mismo flanco: no aplica. El jugador de referencia es central o juega por las dos bandas.")}</span>
      </label>

      {clubesFuera.length > 0 && <div className="pool-descartados">
        <span>{t("Fuera del alcance")}</span>
        {clubesFuera.map((club) => (
          <button key={club} type="button" title={tf("Volver a considerar a {club}", { club })}
            onClick={() => setClubesFuera((actuales) => actuales.filter((x) => x !== club))}>
            {club} <i>×</i>
          </button>
        ))}
      </div>}
    </div>}

    {/* ---- 3. Resultado ---- */}
    {resultado && <div className="pool-resultado">
      <h3>{tf("Se parecen a {jugador}", { jugador: nombreObjetivo })} <i>{ordenados.length}</i></h3>
      <p>{t("El parecido está corregido por cobertura: con pocas métricas en común el número se acerca a la media del conjunto hasta que haya evidencia que lo separe. Sin esa corrección los jugadores de ligas con menos datos salían primeros solo por compararse en menos dimensiones. La columna Bruto es el parecido sin corregir.")}</p>
      <table>
        <thead><tr>
          <th>#</th><th>{t("Jugador")}</th><th>{t("Equipo")}</th><th>{t("Liga")}</th>
          <th>{t("Edad")}</th><th>{t("Min")}</th><th>{t("Parecido")}</th><th>{t("Bruto")}</th><th>{t("Cobertura")}</th>
        </tr></thead>
        <tbody>
          {ordenados.slice(0, 40).map((candidato, posicionEnLista) => (
            <tr key={`${candidato.name}-${candidato.team}-${posicionEnLista}`}
              className={onAbrirInforme ? "clicable" : ""}
              title={onAbrirInforme ? t("Abrir su ficha") : undefined}
              onClick={() => onAbrirInforme?.(basesDelFondo, candidato.index)}>
              <td>{posicionEnLista + 1}</td>
              <td className="pool-name">{candidato.name}</td>
              <td>{candidato.team}</td>
              <td className="pool-liga">{candidato.origen.ligas.join(" · ") || "—"}</td>
              <td>{candidato.age ?? "—"}</td>
              <td>{Math.round(candidato.minutes)}</td>
              <td><b>{candidato.ajustado}%</b></td>
              <td className="pool-crudo">{candidato.similarity}%</td>
              <td className={candidato.coverage < 60 ? "pool-cobertura baja" : "pool-cobertura"}>{candidato.coverage}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pool-aviso">
        {t("No se ajusta por nivel de liga: un parecido alto con un jugador de una competición más débil no significa que rinda igual aquí. Mira siempre de qué liga viene.")}
      </p>
    </div>}
  </section>;
}
