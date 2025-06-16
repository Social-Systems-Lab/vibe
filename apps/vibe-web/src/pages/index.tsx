import { Link } from "waku/router/client";

import { Counter } from "../components/counter";
import { HealthChecker } from "../components/health-checker";

export default function HomePage() {
    return (
        <div>
            <title>Vibe</title>
            <h1 className="text-4xl font-bold tracking-tight">Vibe</h1>
            <p>Welcome to the Vibe monorepo.</p>
            <Counter />
            <HealthChecker />
            <div className="flex gap-4 mt-4">
                <Link to="/about" className="underline">
                    About page
                </Link>
                <Link to="/signup" className="underline">
                    Sign Up
                </Link>
                <Link to="/login" className="underline">
                    Login
                </Link>
            </div>
        </div>
    );
}

export const getConfig = async () => {
    return {
        render: "static",
    } as const;
};
