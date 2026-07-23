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

- **Reportes:** carga entre uno y tres archivos, completa la ficha del jugador y revisa su radar.
- **Combinar bases:** procesa archivos que pueden representar ligas o temporadas y descarga el consolidado.

## Editor visual de páginas

Las páginas 2 y 3 del reporte incluyen un editor local con:

- plantillas de una, dos o tres columnas;
- bloques de imagen y texto que se pueden agregar, eliminar y reordenar;
- comentarios independientes debajo o al lado de cualquier imagen cargada;
- arrastre de bloques y controles alternativos para moverlos;
- ancho, alto y separación ajustables;
- temas de color y colores personalizados;
- tipografías, tamaño, color, negrita, cursiva y alineación para los textos;
- guardado automático del diseño en el navegador e impresión de la página activa.

Los Excel se procesan completamente en el navegador. No se suben a un servidor.

## Flujo del reporte

1. **Cargar datos:** uno, dos o tres Excel de ligas o temporadas.
2. **Completar perfil:** seleccionar al jugador y pegar su URL de Transfermarkt.
   La aplicación extrae dorsal, datos biográficos, valor de mercado, club, liga,
   escudo, logo de competición y retrato transparente. Los tres recursos visuales
   también se pueden reemplazar por archivos PNG, WEBP o JPG locales.
3. **Diseñar reporte:** revisar la ficha imprimible inspirada en
   `Radar Jordhy Thompson v2`, y editar las páginas de visuales y observaciones.

Los datos extraídos y las personalizaciones del perfil se guardan localmente por
jugador en el navegador. Transfermarkt solo se consulta cuando el usuario pega
una URL y presiona el botón de extracción.

## Reglas para combinar bases

- partidos y minutos: suma;
- métricas totales: promedio entre los archivos cargados;
- métricas por 90: promedio ponderado por minutos;
- porcentajes: ponderados por intentos cuando se puede inferir el denominador,
  o por minutos como respaldo;
- equipo y edad: valor del año más reciente o del último archivo cargado.
