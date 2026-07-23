import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, Inter, Oswald, Space_Grotesk } from "next/font/google";
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

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FOS Scout Lab | Reportes de scouting · Scouting Reports",
  description: "Genera reportes de jugadores y combina múltiples bases de ligas o temporadas. Build player scouting reports and combine multiple league or season databases.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${barlow.variable} ${barlowCondensed.variable} ${inter.variable} ${spaceGrotesk.variable} ${oswald.variable}`}>
        {children}
      </body>
    </html>
  );
}
