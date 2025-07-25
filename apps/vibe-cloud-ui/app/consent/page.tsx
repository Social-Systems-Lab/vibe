type PageProps = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ConsentPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const queryString = new URLSearchParams(params as any).toString();
    const appImageUrl = params.app_image_url as string;

    return (
        <div className="flex items-center justify-center h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md text-center">
                <h1 className="text-2xl font-bold">Authorize Application</h1>
                {appImageUrl && <img src={appImageUrl} alt="App Image" className="mx-auto mb-4 rounded-lg max-w-[100px] max-h-[100px]" />}
                <p>
                    The application <strong>{params.client_id}</strong> wants to access your data.
                </p>
                <p>Scopes: {params.scope}</p>
                <form method="POST" action={`/api/auth/authorize/decision?${queryString}`} className="space-y-4">
                    <button type="submit" name="decision" value="allow" className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        Allow
                    </button>
                    <button type="submit" name="decision" value="deny" className="w-full px-4 py-2 text-white bg-gray-400 rounded-lg hover:bg-gray-500">
                        Deny
                    </button>
                </form>
            </div>
        </div>
    );
}
