import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "./globals.css";
import { NoZoom } from "@/components/NoZoom";

export const metadata: Metadata = {
  title: "FoodPlanner Duo",
  description: "Piani alimentari settimanali di Antonio e Gilda: cucina, menù e spesa.",
  appleWebApp: { capable: true, title: "FoodPlanner", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#edf0ef",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body className="antialiased">
        <NoZoom />
        {children}
      </body>
    </html>
  );
}
