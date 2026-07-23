# FOS Scout Lab

Aplicación web personal para crear reportes de scouting a partir de archivos
Excel y consolidar entre una y tres bases con ponderaciones estadísticas.

## Prerequisites

- Node.js `>=22.13.0`

## Uso local

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

Abre `http://localhost:3000` y usa uno de los dos módulos:

- **Reportes:** carga entre uno y tres archivos, selecciona un jugador y revisa su radar.
- **Combinar bases:** procesa archivos que pueden representar ligas o temporadas y descarga el consolidado.

Los Excel se procesan completamente en el navegador. No se suben a un servidor.

## Reglas para combinar bases

- partidos y minutos: suma;
- métricas totales: promedio entre los archivos cargados;
- métricas por 90: promedio ponderado por minutos;
- porcentajes: ponderados por intentos cuando se puede inferir el denominador,
  o por minutos como respaldo;
- equipo y edad: valor del año más reciente o del último archivo cargado.
