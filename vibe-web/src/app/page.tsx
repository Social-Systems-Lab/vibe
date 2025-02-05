// page.tsx - Landing page for Vibe website
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Database, ArrowRightLeft, Key } from "lucide-react";
import PaymentPlans from "../components/PaymentPlans";

export default function HomePage() {
    return (
        <>
            {/* Hero Section */}
            <div className="relative">
                <div className="pt-12 pb-20">
                    <div className="max-w-7xl mx-auto">
                        <div className="grid lg:grid-cols-golden items-center px-4 sm:px-6 lg:px-8">
                            <div className="text-white space-y-8">
                                <div className="space-y-6 lg:space-y-8">
                                    <div className="space-y-2">
                                        <h1 className="text-[3rem] md:text-[5rem] font-normal leading-tight">Your everything.</h1>
                                        <p className="text-xl sm:text-2xl text-white/90 max-w-2xl">
                                            Vibe puts your digital life in your hands—move freely across an open ecosystem of apps and services, carrying your
                                            identity, content, and connections wherever you go.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-4">
                                    <Link
                                        href="/developers"
                                        className="inline-flex items-center bg-[#c17dff] text-white px-8 py-3 rounded-full font-semibold text-lg hover:bg-opacity-90 transition duration-300 shadow-lg"
                                    >
                                        {/* Get the Vibe App */}
                                        Get Involved
                                        <ArrowRight className="ml-2 h-5 w-5" />
                                    </Link>
                                </div>
                            </div>
                            <div className="relative z-10 hidden sm:block">
                                <div className="relative w-full max-w-[300px] mx-auto transform rotate-6 translate-y-16">
                                    {/* Radial gradient spotlight */}
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-gradient-radial from-white/20 to-transparent rounded-full blur-xl" />

                                    <div className="relative w-[280px] h-[560px] mx-auto">
                                        <Image src="/phone.png" alt="Vibe App Interface" fill className="object-contain relative z-10" />
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 opacity-50 blur-2xl -z-10" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Wave Divider - Flipped */}
                <div className="absolute bottom-0 left-0 right-0 transform translate-y-1 z-0">
                    <svg viewBox="0 0 1440 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto" preserveAspectRatio="none">
                        <path d="M0 60C40 80 120 120 240 120C480 120 720 0 960 0C1200 0 1280 80 1440 120V200H0V60Z" fill="white" />
                    </svg>
                </div>
            </div>

            {/* Features Section */}
            <div className="bg-white pt-20 pb-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
                        <FeatureCard
                            icon={<Database className="w-8 h-8 text-purple-500" />}
                            title="Your Data"
                            description="Your identity, relationships and content is in your control"
                        />
                        <FeatureCard
                            icon={<ArrowRightLeft className="w-8 h-8 text-purple-500" />}
                            title="Your Journey"
                            description="Move freely between apps and services carrying your data with you"
                        />
                        <FeatureCard
                            icon={<Key className="w-8 h-8 text-purple-500" />}
                            title="Your Freedom"
                            description="You hold the key. No middlemen. No clouds. No corporate gatekeepers."
                        />
                    </div>
                </div>
            </div>

            {/* Plan Comparison Section */}
            <div className="bg-gray-100 py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Choose your plan</h2>
                    <PaymentPlans />
                </div>
            </div>

            {/* Partners Section */}
            <div className="bg-white py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Our Network</h2>
                    <div className="space-y-12">
                        {/* Social Systems Lab */}
                        <div className="grid md:grid-cols-2 gap-8 items-center">
                            <div className="flex justify-center">
                                <Image src="/ssllogo.png" alt="Social Systems Lab" width={300} height={100} className="h-16 w-auto" />
                            </div>
                            <div className="max-w-xl mx-auto text-center md:text-left">
                                <p className="text-gray-600">
                                    Social Systems Lab focuses on engineering the tools that propel us towards a better world. They support open-source teams
                                    globally to build an ecosystem that provides for our needs without proprietary code, secret algorithms, or value-extracting
                                    practices. As a key supporter of Vibe, they help transform ideas into reality through state-of-the-art engineering.
                                </p>
                                <Link
                                    href="https://www.socialsystems.io"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-purple-600 hover:text-purple-700 mt-4"
                                >
                                    Learn more <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </div>
                        </div>

                        {/* Federated Auth Network */}
                        <div className="grid md:grid-cols-2 gap-8 items-center">
                            <div className="max-w-xl mx-auto text-center md:text-left order-2 md:order-1">
                                <p className="text-gray-600">
                                    The Federated Auth Network (FAN) is pioneering sovereign digital identity through their innovative protocol. FAN shares our
                                    vision of returning control of digital identities to individuals. Together, we&apos;re building a future where digital
                                    autonomy and privacy are fundamental rights.
                                </p>
                                <Link
                                    href="https://opencollective.com/cta/projects/federated-auth-network"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-purple-600 hover:text-purple-700 mt-4"
                                >
                                    Learn more <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </div>
                            <div className="flex justify-center order-1 md:order-2">
                                <div className="flex items-center space-x-4">
                                    <Image src="/fanlogo.png" alt="Federated Auth Network" width={64} height={64} className="h-16 w-auto" />
                                    <span className="text-[22px] font-semibold text-gray-900">Federated Auth Network</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Final CTA Section */}
            <div className="bg-gray-100 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h3 className="text-2xl font-bold text-gray-900 mb-4">Your digital freedom begins here</h3>
                    <p className="text-4xl font-bold text-blue-600 mb-6">2</p>
                    <Link
                        href="/developers"
                        className="inline-flex items-center bg-[#c17dff] text-white px-8 py-3 rounded-full font-semibold text-lg hover:bg-opacity-90 transition duration-300 shadow-lg"
                    >
                        {/* Get the Vibe App */}
                        Get Involved
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                </div>
            </div>
        </>
    );
}

type FeatureCardProps = {
    icon: React.ReactNode;
    title: string;
    description: string;
};

function FeatureCard({ icon, title, description }: FeatureCardProps) {
    return (
        <div className="text-center p-6 hover:transform hover:scale-105 transition-transform duration-300">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl flex items-center justify-center">{icon}</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-800">{title}</h3>
            <p className="text-gray-600">{description}</p>
        </div>
    );
}
