import { Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const bigTechFeatures = [
    "Your profile held hostage",
    "Your content held hostage",
    "Your followers held hostage",
    "No cross-app interoperability",
    "Arbitrary censorship",
    "Hidden algorithms",
    "May use your data to train AI",
    "May sell your data",
    "Fees may be added",
    "Pay-to-win",
    "Attention exploitation",
    "Ads everywhere",
];

const vibeFeatures = [
    "Own your profile",
    "Own your content",
    "Own your network",
    "Universal interoperability",
    "Censorship-resistant",
    "Transparent algorithms",
    "Your data stays yours",
    "No data selling",
    "Free forever",
    "Equal playing field",
    "Attention sovereignty",
    "Ad-free experience",
];

export default function PaymentPlans() {
    return (
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 md:grid-cols-2">
            <div className="relative rounded-3xl bg-white p-8 shadow-lg">
                <div className="absolute right-6 top-0 h-[133px] w-[258px]">
                    <Image src="/images/bigtech.png" alt="Big Tech companies" width={258} height={133} className="object-contain" />
                </div>

                <h3 className="mb-6 text-2xl font-bold text-gray-900">Big Tech</h3>

                <div className="mb-8">
                    <div className="mb-1 flex items-baseline">
                        <span className="text-4xl font-bold text-gray-900">$?</span>
                        <span className="ml-2 text-gray-600">/ month</span>
                    </div>
                    <p className="text-sm text-red-500">*Fees subject to change at any point</p>
                </div>

                <Link
                    href="#waitlist"
                    className="mb-6 block w-full rounded-full bg-gray-200 py-3 text-center text-gray-600 transition hover:bg-gray-300"
                >
                    Cancel plan
                </Link>

                <div className="space-y-4">
                    {bigTechFeatures.map((feature) => (
                        <div key={feature} className="flex items-start">
                            <div className="mr-3 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-100">
                                <span className="text-lg text-red-600">x</span>
                            </div>
                            <span className="text-gray-600">{feature}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="relative rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 p-8 text-white shadow-lg">
                <div className="absolute right-6 top-6 h-[64px] w-[64px]">
                    <Image src="/images/logo.png" alt="Vibe logo" width={64} height={64} className="object-contain" />
                </div>
                <h3 className="mb-6 text-2xl font-bold">Vibe</h3>

                <div className="mb-8">
                    <div className="mb-1 flex items-baseline">
                        <span className="text-4xl font-bold">$0</span>
                        <span className="ml-2">/ forever</span>
                    </div>
                    <p className="text-sm text-white/90">No hidden costs. Ever.</p>
                </div>

                <Link
                    href="#waitlist"
                    className="mb-6 block w-full rounded-full bg-white py-3 text-center font-semibold text-purple-600 transition hover:bg-white/90"
                >
                    Liberate yourself
                </Link>

                <div className="space-y-4">
                    {vibeFeatures.map((feature) => (
                        <div key={feature} className="flex items-start">
                            <div className="mr-3 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                                <Check className="h-4 w-4 text-white" />
                            </div>
                            <span>{feature}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

