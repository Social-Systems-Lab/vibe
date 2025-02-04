import { generateOpenGraphImage, size, contentType } from "../../utils/generate-opengraph-image";

export { size, contentType };

export default async function Image() {
    return generateOpenGraphImage({
        title: "Join the Vibe Revolution",
        description:
            "Help build a future where users own their data, control their digital identity, and move seamlessly between apps and services without barriers.",
        textBackgroundColor: "white",
        textColor: "black",
    });
}
