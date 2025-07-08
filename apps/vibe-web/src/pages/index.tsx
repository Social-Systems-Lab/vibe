import { Link } from "waku/router/client";
import { HealthChecker } from "../components/health-checker";

export default function HomePage() {
    return (
        <div>
            <title>Vibe</title>
            <HealthChecker />
        </div>
    );
}
