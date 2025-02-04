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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto">
            <div className="bg-white rounded-3xl p-8 shadow-lg relative">
                <div className="absolute top-0 right-6 w-[258px] h-[133px]">
                    <Image src="/bigtech.png" alt="Big Tech Companies" width={258} height={133} className="object-contain" />
                </div>

                <h3 className="text-2xl font-bold text-gray-900 mb-6">Big Tech</h3>

                <div className="mb-8">
                    <div className="flex items-baseline mb-1">
                        <span className="text-4xl font-bold text-gray-900">$?</span>
                        <span className="text-gray-600 ml-2">/ month</span>
                    </div>
                    <p className="text-sm text-red-500">*Fees subject to change at any point</p>
                </div>

                <Link href="/developers">
                    <button className="w-full bg-gray-200 text-gray-600 py-3 rounded-full mb-6">Cancel Plan</button>
                </Link>

                <div className="space-y-4">
                    {bigTechFeatures.map((feature, index) => (
                        <div key={index} className="flex items-start">
                            <div className="h-6 w-6 rounded-full bg-red-100 flex items-center justify-center mr-3 mt-0.5">
                                <span className="text-red-600 text-lg">×</span>
                            </div>
                            <span className="text-gray-600">{feature}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-blue-500 rounded-3xl p-8 shadow-lg text-white relative">
                <div className="absolute top-6 right-6 w-[64px] h-[64px]">
                    <Image src="/logo.png" alt="Vibe Logo" width={64} height={64} className="object-contain" />
                </div>
                <h3 className="text-2xl font-bold mb-6">Vibe</h3>

                <div className="mb-8">
                    <div className="flex items-baseline mb-1">
                        <span className="text-4xl font-bold">$0</span>
                        <span className="ml-2">/ forever</span>
                    </div>
                    <p className="text-sm text-white/90">No hidden costs. Ever.</p>
                </div>

                <Link href="/developers">
                    <button className="w-full bg-white text-purple-600 py-3 rounded-full mb-6 font-semibold hover:bg-white/90 transition-colors">
                        Liberate yourself
                    </button>
                </Link>

                <div className="space-y-4">
                    {vibeFeatures.map((feature, index) => (
                        <div key={index} className="flex items-start">
                            <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center mr-3 mt-0.5">
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
