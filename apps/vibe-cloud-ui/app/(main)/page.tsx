import Image from "next/image";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowRightLeft, Database, Info, Key, Mail } from "lucide-react";
import PaymentPlans from "./components/PaymentPlans";

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
    return (
        <div className="text-center p-6 transition-transform duration-300 hover:scale-105">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-purple-100">
                {icon}
            </div>
            <h3 className="mb-2 text-xl font-semibold text-gray-800">{title}</h3>
            <p className="text-gray-600">{description}</p>
        </div>
    );
}

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-500 text-white">
            <div className="relative min-h-screen">
                <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-6">
                        <Link href="/" className="flex items-center gap-2">
                            <Image src="/images/logo.png" alt="Vibe" width={32} height={32} className="h-8 w-8" />
                            <span className="text-xl font-semibold">Vibe</span>
                        </Link>
                        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
                            {/* <Link href="/console/developers" className="transition hover:text-white/80">
                                Developers
                            </Link> */}
                            {/* <Link href="/console/content" className="transition hover:text-white/80">
                                Console
                            </Link> */}
                        </nav>
                    </div>
                    {/* <div className="flex items-center gap-3 text-sm font-medium">
                        <Link
                            href="/console"
                            className="rounded-full border border-white/40 px-4 py-2 transition hover:border-white"
                        >
                            Log in
                        </Link>
                        <Link
                            href="/console"
                            className="rounded-full bg-white px-5 py-2 text-purple-600 transition hover:bg-white/90"
                        >
                            Sign up
                        </Link>
                    </div> */}
                </header>

                <main>
                    {/* Hero */}
                    <section className="relative pt-10 pb-24">
                        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:px-8">
                            <div className="space-y-8">
                                <div className="space-y-4">
                                    <h1 className="text-5xl font-light leading-tight md:text-6xl">Your everything.</h1>
                                    <p className="max-w-2xl text-lg text-white/90 md:text-2xl">
                                        Move freely across an open ecosystem of apps and services. Carry your identity,
                                        content, and connections wherever you go.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-4">
                                    <Link
                                        href="/console"
                                        className="inline-flex items-center rounded-full bg-[#c17dff] px-8 py-3 text-lg font-semibold text-white shadow-lg transition hover:bg-opacity-90"
                                    >
                                        Get Vibe
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Link>
                                </div>
                            </div>
                            <div className="relative hidden justify-center sm:flex">
                                <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 opacity-60 blur-3xl" />
                                <div className="relative h-[500px] w-[260px] z-[100]">
                                    <Image
                                        src="/images/phone.png"
                                        alt="Vibe app"
                                        fill
                                        sizes="260px"
                                        className="object-contain"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="pointer-events-none absolute bottom-0 left-0 right-0 translate-y-1">
                            <svg
                                viewBox="0 0 1440 200"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-auto w-full"
                                preserveAspectRatio="none"
                            >
                                <path
                                    d="M0 60C40 80 120 120 240 120C480 120 720 0 960 0C1200 0 1280 80 1440 120V200H0V60Z"
                                    fill="white"
                                />
                            </svg>
                        </div>
                    </section>

                    {/* Features */}
                    <section className="bg-white pt-20 pb-16 text-gray-900">
                        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-3 lg:gap-12 lg:px-8">
                            <FeatureCard
                                icon={<Database className="h-8 w-8 text-purple-500" />}
                                title="Your Data"
                                description="Control your identity, content, and relationships across every app."
                            />
                            <FeatureCard
                                icon={<ArrowRightLeft className="h-8 w-8 text-purple-500" />}
                                title="Your Journey"
                                description="Move between apps without friction while keeping your content."
                            />
                            <FeatureCard
                                icon={<Key className="h-8 w-8 text-purple-500" />}
                                title="Your Freedom"
                                description="No middlemen. No gatekeepers. You hold the keys to your digital life."
                            />
                        </div>
                    </section>

                    {/* Plans */}
                    <section className="bg-gray-100 py-16 text-gray-900">
                        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                            <h2 className="mb-12 text-center text-3xl font-bold">Choose your plan</h2>
                            <PaymentPlans />
                        </div>
                    </section>

                    {/* Partners */}
                    <section className="bg-white py-16 text-gray-900">
                        <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6 lg:px-8">
                            <h2 className="text-center text-3xl font-bold">Our network</h2>

                            <div className="grid items-center gap-8 md:grid-cols-2">
                                <div className="flex justify-center">
                                    <Image
                                        src="/images/ssllogo.png"
                                        alt="Social Systems Lab"
                                        width={300}
                                        height={100}
                                        className="h-16 w-auto"
                                    />
                                </div>
                                <div className="mx-auto max-w-xl text-center md:text-left">
                                    <p className="text-gray-600">
                                        Social Systems Lab engineers the tools that move us toward a better world. Their
                                        support helps Vibe stay open, transparent, and people-first.
                                    </p>
                                    <Link
                                        href="https://www.socialsystems.io"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-4 inline-flex items-center text-purple-600 transition hover:text-purple-700"
                                    >
                                        Learn more
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </div>
                            </div>

                            <div className="grid items-center gap-8 md:grid-cols-2">
                                <div className="order-2 mx-auto max-w-xl text-center text-gray-600 md:order-1 md:text-left">
                                    <p>
                                        The Federated Auth Network pioneers sovereign digital identity. Together we are
                                        building a future where privacy and autonomy are fundamental rights online.
                                    </p>
                                    <Link
                                        href="https://opencollective.com/cta/projects/federated-auth-network"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-4 inline-flex items-center text-purple-600 transition hover:text-purple-700"
                                    >
                                        Learn more
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </div>
                                <div className="order-1 flex justify-center md:order-2">
                                    <div className="flex items-center gap-4">
                                        <Image
                                            src="/images/fanlogo.png"
                                            alt="Federated Auth Network"
                                            width={64}
                                            height={64}
                                            className="h-16 w-auto"
                                        />
                                        <span className="text-xl font-semibold text-gray-900">
                                            Federated Auth Network
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Final CTA */}
                    <section className="bg-gray-100 py-12 text-gray-900">
                        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
                            <h3 className="mb-6 text-2xl font-bold">Your digital freedom begins here</h3>
                            {/* <p className="mb-6 text-4xl font-bold text-blue-600">2</p> */}
                            <Link
                                href="/console"
                                className="inline-flex items-center rounded-full bg-[#c17dff] px-8 py-3 text-lg font-semibold text-white shadow-lg transition hover:bg-opacity-90"
                            >
                                Get Vibe
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Link>
                        </div>
                    </section>
                </main>

                <footer className="absolute bottom-4 right-4">
                    <details className="group inline-block">
                        <summary className="flex cursor-pointer items-center gap-3 rounded-full bg-white/20 px-3 py-2 text-sm text-white shadow-md backdrop-blur">
                            <Info className="h-5 w-5" />
                            <span className="hidden group-open:inline">{process.env.version || "v1.0.0"}</span>
                            <span className="hidden group-open:inline">|</span>
                            <span className="hidden group-open:inline">
                                <Link href="mailto:admin@socialsystems.io" className="flex items-center gap-1">
                                    <Mail className="h-5 w-5" />
                                    <span>admin@socialsystems.io</span>
                                </Link>
                            </span>
                        </summary>
                    </details>
                </footer>
            </div>
        </div>
    );
}
