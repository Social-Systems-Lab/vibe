import Link from "next/link";
import { ArrowRight, Github, Mail } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Developers | Vibe",
    description: "Join the Vibe revolution. Contribute to our open-source projects and help build the foundation of a new internet.",
    metadataBase: new URL("https://vibeapp.dev/"),
};

export default function DevelopersPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-400">
            <main className="max-w-4xl mx-auto px-4 py-16">
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-8">Join the Vibe Revolution</h1>

                <section className="bg-white rounded-xl p-8 mb-12 shadow-lg">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4">Our Vision</h2>
                    <p className="text-gray-600 text-lg mb-6">
                        Vibe is more than just an app—it&apos;s a movement towards true digital freedom. We&apos;re building a future where users own their
                        data, control their digital identity, and move seamlessly between apps and services without barriers.
                    </p>
                    <p className="text-gray-600 text-lg">
                        By joining Vibe, you&apos;re not just developing software; you&apos;re shaping the future of the internet. Help us create a more open,
                        interoperable, and user-centric digital world.
                    </p>
                </section>

                <div className="grid md:grid-cols-2 gap-8">
                    <section className="bg-white rounded-xl p-8 shadow-lg">
                        <h2 className="text-2xl font-semibold text-gray-800 mb-4">For Developers</h2>
                        <p className="text-gray-600 mb-6">Contribute to our open-source projects and help build the foundation of a new internet.</p>
                        <Link
                            href="https://github.com/Social-Systems-Lab/vibe"
                            className="inline-flex items-center bg-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-opacity-90 transition duration-300"
                        >
                            <Github className="mr-2 h-5 w-5" />
                            Join us on GitHub
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </section>

                    <section className="bg-white rounded-xl p-8 shadow-lg">
                        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Follow Vibe</h2>
                        <p className="text-gray-600 mb-6">Be the first to experience Vibe and shape its future. Sign up for early access and updates.</p>
                        <form className="space-y-4" action="https://formspree.io/f/mvgzrjgv" method="POST">
                            <input
                                type="text"
                                name="name"
                                required
                                placeholder="Your Name"
                                className="w-full px-4 py-2 rounded-full bg-gray-100 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
                            />
                            <input
                                type="email"
                                name="email"
                                required
                                placeholder="Your Email"
                                className="w-full px-4 py-2 rounded-full bg-gray-100 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
                            />
                            <textarea
                                name="message"
                                placeholder="Optional message"
                                className="w-full px-4 py-2 rounded-[15px] bg-gray-100 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
                            ></textarea>

                            <button
                                type="submit"
                                className="inline-flex items-center bg-purple-600 text-white px-6 py-3 rounded-full font-semibold hover:bg-opacity-90 transition duration-300"
                            >
                                <Mail className="mr-2 h-5 w-5" />
                                Follow Vibe
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </button>
                        </form>
                    </section>
                </div>
            </main>
        </div>
    );
}
