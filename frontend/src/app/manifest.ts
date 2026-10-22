import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Questo — your open-source learning adventure",
    short_name: "Questo",
    description: "Turn your open-source goals into small, rewarding daily quests.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fffdf7",
    theme_color: "#fffdf7",
    icons: [
      {
        src: "/icons/questo.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/questo-maskable.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
