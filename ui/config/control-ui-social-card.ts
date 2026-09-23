import fs from "node:fs";
import { PhotonImage, resize, SamplingFilter, watermark } from "@silvia-odwyer/photon-node";
import type { Plugin } from "vite";

/** Generate the public card from the existing brand artwork, without a browser or fonts. */
export function controlUiSocialCardPlugin(): Plugin {
  return {
    name: "control-ui-social-card",
    apply: "build",
    buildStart() {
      const pixels = Buffer.alloc(1200 * 630 * 4, Buffer.from([11, 16, 22, 255]));
      const canvas = new PhotonImage(pixels, 1200, 630);
      const images = [canvas];
      try {
        const source = PhotonImage.new_from_byteslice(
          fs.readFileSync(new URL("../../docs/assets/openagent-banner.png", import.meta.url)),
        );
        images.push(source);
        // Fit the banner to 1060px wide, keeping its aspect ratio, centered on the card.
        const width = 1060;
        const height = Math.round((width * source.get_height()) / source.get_width());
        const logo = resize(source, width, height, SamplingFilter.Lanczos3);
        images.push(logo);
        watermark(canvas, logo, BigInt((1200 - width) / 2), BigInt(Math.round((630 - height) / 2)));
        this.emitFile({ type: "asset", fileName: "social-card.png", source: canvas.get_bytes() });
      } finally {
        for (const image of images) {
          image.free();
        }
      }
    },
  };
}
