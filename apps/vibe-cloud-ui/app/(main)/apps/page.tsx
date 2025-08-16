import CurrentAppsGrid from "../components/home/CurrentAppsGrid";

export default function AppsPage() {
    return (
        <main className="w-full">
            <section className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
                <CurrentAppsGrid />
            </section>
        </main>
    );
}
