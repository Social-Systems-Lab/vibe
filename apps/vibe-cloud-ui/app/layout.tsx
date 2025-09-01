import { Libre_Franklin, Wix_Madefor_Display } from "next/font/google";
import "./globals.css";

const libre_franklin = Libre_Franklin({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-libre-franklin",
});

const wix_madefor_display = Wix_Madefor_Display({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-wix-madefor-display",
});

// Add this metadata export:
export const metadata = {
    icons: {
        icon: "/images/favicon.png",
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${libre_franklin.variable} ${wix_madefor_display.variable}`}>
            <body>{children}</body>
        </html>
    );
}
