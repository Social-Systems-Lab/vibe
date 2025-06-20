import { Link } from "waku/router/client";
import { HealthChecker } from "../components/health-checker";

export default function HomePage() {
    return (
        <div>
            <title>Vibe</title>
            <HealthChecker />
            <div className="flex gap-4 mt-4">
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
