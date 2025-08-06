import { ProfileMenu, Header, Layout, Content, LeftPanel } from "vibe-react";
import { VibeProvider } from "../components/VibeProvider";
import { UploadButton } from "../components/UploadButton";
import "vibe-react/dist/vibe-react.css";

export default function MainLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <VibeProvider>
            <Layout>
                <Header
                    left={
                        <div className="flex items-center space-x-2 px-3">
                            <img src="/images/logotype.png" alt="Collections" className="h-8" />
                        </div>
                    }
                    center={
                        <div className="w-full max-w-[800px] px-2">
                            <input type="text" placeholder="Search by name or tag" className="w-full h-10 rounded-full bg-neutral-100 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                    }
                    right={
                        <div className="flex items-center space-x-4 mr-2">
                            <ProfileMenu />
                        </div>
                    }
                    border
                    height={56}
                />
                <Content
                    left={
                        <LeftPanel padded topOffset={56}>
                            <CollectionsLeftNav />
                        </LeftPanel>
                    }
                    topOffset={56}
                >
                    {children}
                </Content>
            </Layout>
        </VibeProvider>
    );
}

function CollectionsLeftNav() {
    return (
        <div className="space-y-6 pr-4 h-full flex flex-col">
            <div className="p-2">
                <UploadButton />
            </div>
            <nav className="px-2">
                <ul className="space-y-1">
                    <li className="h-12 flex flex-row px-3 py-2 rounded-md bg-neutral-100 font-medium text-neutral-900 items-center gap-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" className="text-neutral-700">
                            <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                        </svg>
                        <span>All</span>
                    </li>
                </ul>
            </nav>
            <div className="pt-4 px-2 mt-auto pb-4">
                <StorageUsage />
            </div>
        </div>
    );
}

function StorageUsage() {
    return (
        <div className="space-y-2">
            <div className="flex text-[16px] font-bold text-neutral-600">
                <span>Storage</span>
            </div>
            <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `15%` }} />
            </div>
            <div className="text-center text-[16px] text-neutral-500">0.8 GB of 5 GB used</div>
        </div>
    );
}
