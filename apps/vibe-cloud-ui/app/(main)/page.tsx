import WelcomeHero from "./components/home/WelcomeHero";
import CommunityPulse from "./components/home/CommunityPulse";
import WhatsNewFeed from "./components/home/WhatsNewFeed";
import DiscoverAppsGrid from "./components/home/DiscoverAppsGrid";
import YourActivityPanel from "./components/home/YourActivityPanel";
import DeveloperPortalPromo from "./components/home/DeveloperPortalPromo";
import CurrentAppsGrid from "./components/home/CurrentAppsGrid";

export default function Page() {
    return (
        <main className="flex flex-col gap-2">
            <WelcomeHero />
            <CommunityPulse />
            <WhatsNewFeed />
            <CurrentAppsGrid />
            <DiscoverAppsGrid />
            <YourActivityPanel />
            <DeveloperPortalPromo />
        </main>
    );
}
