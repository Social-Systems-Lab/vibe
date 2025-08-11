export default function Page() {
    const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "local";
    console.log(`Rendering Vibe Cloud UI version: ${appVersion}`);
    return <h1 className="font-heading">Vibe Cloud UI version: {appVersion}</h1>;
}
