type PageProps = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function LoginPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const queryString = new URLSearchParams(params as any).toString();

    return (
        <div className="grid md:grid-cols-2 h-screen">
            <div className="hidden md:block bg-gray-100 p-12">
                <h2 className="text-3xl font-bold text-gray-800">Vibe</h2>
                <p className="mt-4 text-gray-600">Your digital world, unified.</p>
            </div>
            <div className="flex flex-col items-center justify-center bg-white p-8">
                <div className="w-full max-w-md space-y-6">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold font-heading">Login</h1>
                        <p className="mt-2 text-gray-600">
                            to continue to <strong>{params.client_id || "your app"}</strong>
                        </p>
                    </div>
                    <form method="POST" action={`/auth/login?${queryString}`} className="space-y-6">
                        <div>
                            <input type="email" name="email" placeholder="Email" required className="w-full px-4 py-2 mt-1 border rounded-lg" />
                        </div>
                        <div>
                            <input type="password" name="password" placeholder="Password" required className="w-full px-4 py-2 mt-1 border rounded-lg" />
                        </div>
                        <button type="submit" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                            Login
                        </button>
                    </form>
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">Or</span>
                        </div>
                    </div>
                    <p className="text-center">
                        Don't have an account?{" "}
                        <a href={`/signup?${queryString}`} className="text-blue-600 hover:underline">
                            Sign up
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
