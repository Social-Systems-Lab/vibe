import { Link } from "waku";

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
            <Link to="/about" className="mt-4 inline-block underline">
                About page
            </Link>
        </div>
    );
}

export const getConfig = async () => {
    return {
        render: "static",
    } as const;
};
