type PageProps = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function SignupPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const queryString = new URLSearchParams(params as any).toString();

    return (
        <div className="flex items-center justify-center h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                <h1 className="text-2xl font-bold text-center">Sign Up</h1>
                <p className="text-center text-gray-600">
                    To authorize <strong>{params.client_id}</strong>
                </p>
                <form method="POST" action={`/api/auth/signup?${queryString}`} className="space-y-6">
                    <input type="email" name="email" placeholder="Email" required className="w-full px-4 py-2 border rounded-lg" />
                    <input type="password" name="password" placeholder="Password" required className="w-full px-4 py-2 border rounded-lg" />
                    <button type="submit" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        Sign Up
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
                    Already have an account?{" "}
                    <a href={`/auth/login?${queryString}`} className="text-blue-600 hover:underline">
                        Log in
                    </a>
                </p>
            </div>
        </div>
    );
}
