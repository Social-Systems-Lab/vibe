import "../styles.css";

import type { ReactNode } from "react";
import { Provider } from "jotai";

import { Header } from "../components/header";
import { Footer } from "../components/footer";

type RootLayoutProps = { children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <Provider>
            <div className="font-['Nunito']">
                <meta name="description" content="Vibe - your everything" />
                <link rel="icon" type="image/png" href="/images/favicon.png" />
                <Header />
                <main className="m-6 flex items-center *:min-h-64 *:min-w-64 lg:m-0 lg:min-h-svh lg:justify-center">{children}</main>
                <Footer />
            </div>
        </Provider>
    );
}
