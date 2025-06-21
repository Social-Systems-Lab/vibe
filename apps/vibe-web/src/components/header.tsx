import { Link } from "waku";
import { AuthWidget } from "vibe-react";

export const Header = () => {
    return (
        <header className="flex items-center justify-between gap-4 p-6 lg:fixed lg:left-0 lg:top-0 w-full">
            <h2 className="text-lg font-bold tracking-tight">
                <Link to="/">Vibe</Link>
            </h2>
            <AuthWidget />
        </header>
    );
};
