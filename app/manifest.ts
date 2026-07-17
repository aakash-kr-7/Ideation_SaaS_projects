import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ShouldBuild",
    short_name: "ShouldBuild",
    description: "Evidence-backed market validation for product ideas.",
    start_url: "/",
    display: "standalone",
    background_color: "#061827",
    theme_color: "#70C9B5",
    icons: [
      {
        src: "/brand/shouldbuild-icon.png",
        sizes: "1199x1198",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
