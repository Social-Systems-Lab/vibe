import { ArrowRight, Mail } from "lucide-react";

export default function ManifestoPage() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-400">
            <main className="max-w-4xl mx-auto px-4 py-16">
                <h1 className="text-4xl md:text-5xl font-bold text-white mb-8">
                    Declaration of Independence
                    <br />
                    (From Big Tech)
                </h1>

                <section className="bg-white rounded-xl p-8 mb-12 shadow-lg">
                    {/* <h1 className="text-4xl md:text-5xl font-bold text-black mb-8">
                        Declaration of Independence
                        <br />
                        (From Big Tech)
                    </h1> */}

                    <div className="prose prose-lg text-gray-600 space-y-4">
                        <p>
                            We stand at a pivotal moment in history. Big Tech monopolies have seized control over nearly every aspect of our digital
                            lives—communication, social media, content, commerce, and even our very identities. Where the internet was once a niche realm of
                            technical pioneers, it is now a force that ignites movements, shapes public dialogue, and decides the outcome of elections. It is
                            essential that the systems and services that dominate this space aim to safeguard the rights that are indispensable to human
                            freedom, dignity and self-determination.
                        </p>
                        <p>
                            We assert certain rights as essential to our digital lives: the right to access fundamental services without barriers, the right to
                            free expression unshackled by corporate algorithms, the right to privacy and control of our own data, the right to digital
                            self-sovereignty where no corporation can hold our identities, relationships and creative works hostage, the right to a fair and
                            open digital economy that rewards contributions rather than exploits them, and the right to a safe, truth-respecting digital
                            environment untainted by manipulative profiteering.
                        </p>
                        <p>
                            Time and again, Big Tech has betrayed these rights: hoarding and selling our data, shaping our perceptions for gain, censoring
                            dissent, erecting walled gardens, siphoning the rewards of our creativity, weaponizing their platforms to sow discord, and clinging
                            to monopolies in commerce and infrastructure. But there comes a moment when the weight of exploitation becomes undeniable, when the
                            realization dawns that the only path forward is to break free.
                        </p>
                        <p className="font-bold">That time has come.</p>
                        <p>
                            We choose to build anew. We refuse to leave basic rights to the whims of profit-driven corporations. Instead, we will design and
                            adopt superior systems that enshrine these values at the core. This will not happen overnight, but through a deliberate, steady
                            progression. Service by service, we will strike each Big Tech dependency off our list—shedding corporate identity providers,
                            reclaiming our files from corporate clouds, creating new social media and streaming services, reclaiming our social
                            connections—until digital freedom ceases to be a distant dream and becomes our reality.
                        </p>
                        <p>
                            We are developers, activists, and dreamers—all committed to liberating ourselves from exploitative corporate gatekeepers and forging
                            platforms that place power back where it belongs: in our hands. By turning away from exploitative services and creating open, free
                            solutions, we spark a collective transformation. We will make their control obsolete.
                        </p>
                        <p>
                            Join us on this path. Together, we will reclaim our digital spaces, honor our autonomy, and ensure the next generation of technology
                            is built for freedom, dignity, and shared prosperity. This is our revolution, and we invite you to be part of it.
                        </p>
                    </div>
                </section>

                <section className="bg-white rounded-xl p-8 shadow-lg">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-4">Join the Vibe Revolution</h2>
                    <p className="text-gray-600 mb-6">Be part of this movement. Follow our project and stay updated on our progress.</p>
                    <form className="space-y-4" action="https://formspree.io/f/mvgzrjgv" method="POST">
                        <input
                            type="text"
                            name="name"
                            placeholder="Your Name"
                            className="w-full px-4 py-2 rounded-full bg-gray-100 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
                        />
                        <input
                            type="email"
                            name="email"
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
            </main>
        </div>
    );
}
