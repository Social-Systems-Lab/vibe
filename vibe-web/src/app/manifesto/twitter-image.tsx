import { generateOpenGraphImage, size, contentType } from "../../utils/generate-opengraph-image";

export { size, contentType };

export default async function Image() {
    return generateOpenGraphImage({
        title: "Declaration of Independence",
        title2: "(From Big Tech)",
        backgroundImage: "https://vibeapp.dev/decl.png",
        textBackgroundColor: "#333333bb",
    });
}
