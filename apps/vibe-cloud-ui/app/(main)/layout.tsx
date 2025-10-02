import { ReactNode } from "react";

type LayoutProps = {
    children: ReactNode;
};

export default function MainLayout({ children }: LayoutProps) {
    return <>{children}</>;
}

