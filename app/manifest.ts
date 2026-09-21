import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FoodPlanner Duo",
    short_name: "FoodPlanner",
    description: "Piani alimentari settimanali di Antonio e Gilda: cucina, menù e spesa.",
    start_url: "/",
    display: "standalone",
    background_color: "#091929",
    theme_color: "#edf0ef",
    lang: "it",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
