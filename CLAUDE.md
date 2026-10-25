# FOS Scout Lab — contexto para Claude

App web personal (Next.js vía vinext + Cloudflare worker, Drizzle) para crear reportes de scouting desde Excel y consolidar 1–3 bases con ponderaciones. Dueño: Felipe (español; conciso).

## Comandos
- `npm install`, `npm run dev` (http://localhost:3000), `npm run build`, `npm test` (build + node --test tests/*.test.mjs). Node >=22.13.
- Sitio público en GitHub Pages: https://felipeorma.github.io/fos-scout-lab/ (`npm run build:pages`). Este repo es PÚBLICO a propósito por Pages; no subir datos con licencia ni secretos.

## Estructura
`app/` rutas, `lib/`, `db/` (schema Drizzle), `worker/`, `scripts/` (bg-server.py, rembg), `examples/`, `tests/`.

## Estado / pendientes
(Felipe: completa al cerrar sesión.) Idea futura: mover el sitio a Vercel/Netlify/Cloudflare Pages para poder hacer el repo privado.

## Secretos
Nunca en el repo (es público). Variables de entorno en pipi.
