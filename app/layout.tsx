import type { Metadata } from "next";
import { Patrick_Hand } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const hand = Patrick_Hand({ weight: "400", subsets: ["latin"], variable: "--font-hand" });

export const metadata: Metadata = {
  title: "PIXEL HEIST",
  description: "Steal reality. Escape the sketch. Cut real objects out of photos with Meta SAM 3.1 and use their shapes to solve a sketch-world heist.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={hand.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
