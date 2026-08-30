import type { Metadata } from "next";
import { Archivo, Barlow, Barlow_Condensed, Oswald } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// La cara de titular. El nombre de la variable se mantiene para no reescribir
// las cincuenta reglas que ya la usan.
const archivo = Archivo({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Felipe Ormazabal Scouting | Reportes de scouting · Scouting Reports",
  description: "Genera reportes de jugadores y combina múltiples bases de ligas o temporadas. Build player scouting reports and combine multiple league or season databases.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${barlow.variable} ${barlowCondensed.variable} ${archivo.variable} ${oswald.variable}`}>
        {children}
      </body>
    </html>
  );
}
