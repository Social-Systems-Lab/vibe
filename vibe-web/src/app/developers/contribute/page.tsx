// developers/contribute/page.tsx - Get Involved page
import Link from "next/link";
import { ArrowRight, Github, Mail } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Get Involved with Vibe | Developer Documentation",
    description: "Join the Vibe revolution. Contribute to our open-source projects and help build the foundation of a new internet.",
};

export default function ContributePage() {
    return (
        <>
            <div className="mb-8">
                <div className="flex items-center mb-6">
                    <div className="h-8 w-1 bg-purple-600 mr-3"></div>
                    <h2 className="text-3xl font-bold text-gray-800">Join the Vibe Revolution</h2>
                </div>
                
                <p className="text-gray-600 text-lg mb-4">
                    Vibe is more than just an app—it's a movement towards true digital freedom. We're building a 
                    future where users own their data, control their digital identity, and move seamlessly between 
                    apps and services without barriers.
                </p>
                
                <p className="text-gray-600 text-lg mb-6">
                    By joining Vibe, you're not just developing software; you're shaping the future of the internet. 
                    Help us create a more open, interoperable, and user-centric digital world.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
                <section className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-8 mb-12">
                    <h3 className="text-2xl font-semibold text-gray-800 mb-4">Ways to Contribute</h3>
                    
                    <div className="space-y-6">
                        <div>
                            <h4 className="text-lg font-semibold text-gray-800 mb-2">Code Contributions</h4>
                            <p className="text-gray-600 mb-2">
                                Help develop the Vibe platform and SDKs. We welcome contributions of all sizes, from bug fixes to new features.
                            </p>
                            <ul className="list-disc list-inside text-gray-600 ml-2">
                                <li>Fix bugs and issues</li>
                                <li>Implement new features</li>
                                <li>Improve documentation</li>
                                <li>Write tests</li>
                            </ul>
                        </div>
                        
                        <div>
                            <h4 className="text-lg font-semibold text-gray-800 mb-2">Build Vibe Apps</h4>
                            <p className="text-gray-600">
                                Create new applications that leverage the Vibe ecosystem. Share your creations with the community
                                and help demonstrate the power of user-owned data.
                            </p>
                        </div>
                        
                        <div>
                            <h4 className="text-lg font-semibold text-gray-800 mb-2">Spread the Word</h4>
                            <p className="text-gray-600">
                                Help us grow the Vibe community by sharing your experience with others and explaining
                                why digital freedom matters.
                            </p>
                        </div>
                    </div>
                    
                    <div className="mt-6">
                        <Link
                            href="https://github.com/Social-Systems-Lab/vibe"
                            className="inline-flex items-center bg-purple-600 text-white px-6 py-3 rounded-md font-semibold hover:bg-opacity-90 transition duration-300"
                        >
                            <Github className="mr-2 h-5 w-5" />
                            Join us on GitHub
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </div>
                </section>

                <section className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-8 mb-12">
                    <h3 className="text-2xl font-semibold text-gray-800 mb-4">Follow Vibe</h3>
                    <p className="text-gray-600 mb-6">
                        Be the first to experience Vibe and shape its future. Sign up for early access, development updates, and announcements.
                    </p>
                    <form className="space-y-4" action="https://formspree.io/f/mvgzrjgv" method="POST">
                        <input
                            type="text"
                            name="name"
                            required
                            placeholder="Your Name"
                            className="w-full px-4 py-2 rounded-md bg-white text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400"
                        />
                        <input
                            type="email"
                            name="email"
                            required
                            placeholder="Your Email"
                            className="w-full px-4 py-2 rounded-md bg-white text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400"
                        />
                        <textarea
                            name="message"
                            placeholder="Optional message"
                            className="w-full px-4 py-2 rounded-md bg-white text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400 min-h-[100px]"
                        ></textarea>

                        <button
                            type="submit"
                            className="inline-flex items-center bg-purple-600 text-white px-6 py-3 rounded-md font-semibold hover:bg-opacity-90 transition duration-300"
                        >
                            <Mail className="mr-2 h-5 w-5" />
                            Follow Vibe
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </button>
                    </form>
                </section>
            </div>

            <section className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-8 mb-12">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">Community Guidelines</h3>
                <p className="text-gray-600 mb-4">
                    When contributing to Vibe, please follow these guidelines to ensure a positive and productive community:
                </p>
                
                <ul className="space-y-3 text-gray-600">
                    <li className="flex">
                        <span className="text-purple-600 font-bold mr-2">•</span>
                        <span><strong>Be respectful:</strong> Treat all community members with respect and consideration.</span>
                    </li>
                    <li className="flex">
                        <span className="text-purple-600 font-bold mr-2">•</span>
                        <span><strong>Be constructive:</strong> Provide helpful feedback and solutions rather than just pointing out problems.</span>
                    </li>
                    <li className="flex">
                        <span className="text-purple-600 font-bold mr-2">•</span>
                        <span><strong>Follow best practices:</strong> Write clean, well-documented code with appropriate tests.</span>
                    </li>
                    <li className="flex">
                        <span className="text-purple-600 font-bold mr-2">•</span>
                        <span><strong>Help others:</strong> Share your knowledge and help newer community members get started.</span>
                    </li>
                    <li className="flex">
                        <span className="text-purple-600 font-bold mr-2">•</span>
                        <span><strong>Stay on topic:</strong> Keep discussions relevant to Vibe development and digital freedom.</span>
                    </li>
                </ul>
            </section>

            <section className="text-center py-8">
                <h3 className="text-2xl font-semibold text-gray-800 mb-4">Ready to Help Shape the Future?</h3>
                <p className="text-gray-600 text-lg mb-6 max-w-2xl mx-auto">
                    Join us in building a more open, user-centric internet where individuals have control over 
                    their digital lives.
                </p>
                <Link
                    href="https://github.com/Social-Systems-Lab/vibe"
                    className="inline-flex items-center bg-purple-600 text-white px-8 py-3 rounded-md font-semibold hover:bg-opacity-90 transition duration-300"
                >
                    <Github className="mr-2 h-5 w-5" />
                    Start Contributing
                </Link>
            </section>
        </>
    );
}