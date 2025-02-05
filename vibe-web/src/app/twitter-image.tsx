// twitter-image.tsx
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

export const size = {
    width: 1200,
    height: 630,
};

export const contentType = "image/png";

export default async function Image() {
    const libreFranklin = await readFile(join(process.cwd(), "assets/LibreFranklin-SemiBold.ttf"));
    const bg = {
        background: "linear-gradient(to bottom right, #3b82f6, #a855f7)",
    };

    return new ImageResponse(
        (
            <div
                style={{
                    ...bg,
                    fontSize: 64,
                    color: "white",
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Libre Franklin",
                    fontWeight: 400,
                    textAlign: "center",
                    padding: "20px",
                    position: "relative",
                }}
            >
                <div
                    style={{
                        fontSize: 104,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                    }}
                >
                    <div>Your everything.</div>
                </div>
                <div
                    style={{
                        position: "absolute",
                        top: 20,
                        left: 20,
                        height: 100,
                        borderRadius: "50px",
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
                    <div style={{ marginLeft: 20 }}>Vibe</div>
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
