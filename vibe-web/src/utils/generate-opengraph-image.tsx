// generate-opengraph-image.tsx
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

const size = {
    width: 1200,
    height: 630,
};

const contentType = "image/png";

type OpenGraphImageProps = {
    title?: string;
    title2?: string;
    description?: string;
    backgroundImage?: string;
    textBackgroundColor?: string;
    textColor?: string;
};
export async function generateOpenGraphImage({ title, title2, description, backgroundImage, textBackgroundColor, textColor }: OpenGraphImageProps) {
    // Load Libre Franklin font
    const libreFranklin = await readFile(join(process.cwd(), "assets/LibreFranklin-SemiBold.ttf"));
    const bg = backgroundImage
        ? {
              backgroundImage: `url(${backgroundImage})`,
              backgroundSize: "cover",
          }
        : {
              background: "linear-gradient(to bottom right, #3b82f6, #a855f7)",
          };

    const textBg = {
        backgroundColor: textBackgroundColor ?? "#333333bb",
        padding: "30px 50px 30px 50px",
        borderRadius: "50px",
    };

    return new ImageResponse(
        (
            <div
                style={{
                    ...bg,
                    fontSize: 64,
                    color: textColor ?? "white",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Libre Franklin",
                    fontWeight: 400,
                    textAlign: "center",
                    padding: "20px 40px 20px 40px",
                    position: "relative",
                }}
            >
                <div
                    style={{
                        ...textBg,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                    }}
                >
                    {title && <div>{title}</div>}
                    {title2 && <div>{title2}</div>}
                    {description && (
                        <div
                            style={{
                                fontSize: 42,
                                marginTop: 20,
                            }}
                        >
                            {description}
                        </div>
                    )}
                </div>
                <div
                    style={{
                        position: "absolute",
                        top: 20,
                        left: 20,
                        height: 100,
                        borderRadius: "50px",
                        backgroundColor: backgroundImage ? "#3b82f6" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingLeft: 20,
                        paddingRight: 40,
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="https://vibeapp.dev/logo.png"
                        alt="Vibe Logo"
                        style={{
                            width: 70,
                            height: 70,
                        }}
                    />
                    <div style={{ color: "white", marginLeft: 20 }}>Vibe</div>
                </div>
            </div>
        ),
        {
            ...size,
            fonts: [
                {
                    name: "Libre Franklin",
                    data: libreFranklin,
                },
            ],
        }
    );
}

export { size, contentType };
