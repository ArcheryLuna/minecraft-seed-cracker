import type { Metadata } from "next";
import { Inter, Pixelify_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { NavBar } from "@/components/nav/NavBar";
import { cn } from "@/lib/utils";

// "Minecraft Font" by JDGraphics (see app/fonts/README.md) for the block-game look.
// It only covers basic Latin, so Pixelify Sans fills in other characters, then Inter.
const minecraft = localFont({
  src: [
    { path: "./fonts/minecraft-regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/minecraft-bold.otf", weight: "700", style: "normal" },
  ],
  variable: "--font-minecraft",
});
const pixel = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// JetBrains Mono for seeds and coordinates.
const jetbrains = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-jetbrains",
});
// The same files limited to the digits 0-9. Listed first in the text font stack,
// so every number is drawn in JetBrains Mono and the rest in the pixel font.
// (Font loader options must be literals, so the file list is repeated.)
const digits = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-digits",
  declarations: [{ prop: "unicode-range", value: "U+0030-0039" }],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Seed Cracker",
  description: "Recover a Minecraft: Java Edition world seed from the coordinates of structures you've found.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("dark h-full antialiased", digits.variable, minecraft.variable, pixel.variable, inter.variable, jetbrains.variable)}>
      <body className="flex min-h-full flex-col font-sans">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
