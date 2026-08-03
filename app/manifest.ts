import type { MetadataRoute } from "next";
import { manifestColors } from "@/lib/design-tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ShouldBuild",
    short_name: "ShouldBuild",
    description: "Evidence-backed market validation for product ideas.",
    start_url: "/",
    display: "standalone",
    background_color: manifestColors.background,
    theme_color: manifestColors.theme,
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
