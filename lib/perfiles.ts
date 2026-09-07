/**
 * Los puestos con los que trabaja la plataforma, en el orden en que se leen
 * sobre el campo: portería, defensa, medio, ataque.
 *
 * Vive aquí y no dentro de una pantalla porque lo usan el ranking y la barra
 * de filtros, y dos listas separadas acabarían ofreciendo puestos distintos en
 * sitios distintos.
 */
export const PERFILES = [
  { id: "GK", nombre: "Porteros" },
  { id: "CB", nombre: "Centrales" },
  { id: "FB", nombre: "Laterales" },
  { id: "DMF", nombre: "Pivotes / mediocentros" },
  { id: "B2B", nombre: "Interiores (box-to-box)" },
  { id: "WING", nombre: "Extremos" },
  { id: "DWING", nombre: "Extremos directos" },
  { id: "AM", nombre: "Mediapuntas" },
  { id: "CF", nombre: "Delanteros" },
] as const;

/**
 * Los que puede usar un filtro general.
 *
 * "Extremos directos" queda fuera a propósito: no sale nunca de la detección
 * automática —es una lente de lectura, no un puesto que ninguna base escriba—
 * así que filtrar por él devolvería siempre cero. El ranking sí lo ofrece,
 * porque allí se traduce a "extremos" y se puntúa con su set de métricas.
 */
export const PERFILES_FILTRO = PERFILES.filter((perfil) => perfil.id !== "DWING");
