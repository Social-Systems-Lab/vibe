// apps/test/src/pages/AppPage.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useVibe, VibeProvider } from "../vibe/react.tsx";
import type { Unsubscribe, AppManifest } from "../vibe/types.ts";
import logoSvg from "../logo.svg";

const notesAppManifest: AppManifest = {
    appId: "notes-test-app", // Unique ID for this application
    name: "Notes Test App",
    description: "Notes application for testing Vibe Protocol integration.",
    permissions: ["read:notes", "write:notes"],
    iconUrl: `${window.location.origin}${logoSvg}`,
};

// --- Inner Component using useVibe ---
// This component contains the actual application UI and logic
// that interacts with the Vibe SDK via the useVibe hook.
function AppContent() {
    // Get state and methods from useVibe
    const { activeIdentity, readOnce, read, write } = useVibe();
    const [notes, setNotes] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [status, setStatus] = useState<string>("Initializing VibeProvider...");
    const taskSubscription = useRef<Unsubscribe | null>(null);

    // --- Effect to update status based on active identity ---
    useEffect(() => {
        if (activeIdentity) {
            setStatus("VibeProvider initialized. Ready.");
        } else {
            // This might briefly show if init fails or hasn't completed
            setStatus("Waiting for Vibe initialization...");
        }
    }, [activeIdentity]);

    // --- Handlers (using methods from useVibe) ---
    const handleReadNotesOnce = useCallback(async () => {
        if (!activeIdentity) {
            setStatus("Active identity not initialized. Cannot read notes.");
            return;
        }
        setStatus("Reading notes...");
        try {
            const result = await readOnce("notes");
            setNotes(result.data || []);
            setStatus("Notes read successfully.");
            console.log("[AppPage] Notes read:", result.data);
        } catch (error) {
            console.error("[AppPage] Error reading notes:", error);
            setStatus(`Error reading notes: ${error instanceof Error ? error.message : String(error)}`);
            setNotes([]);
        }
    }, [readOnce, activeIdentity]);

    const handleWriteNote = useCallback(async () => {
        if (!activeIdentity) {
            setStatus("Active identity not initialized. Cannot write note.");
            return;
        }
        setStatus("Writing new note...");
        const newNote = {
            text: `New note added at ${new Date().toLocaleTimeString()}`,
            createdAt: new Date().toISOString(),
        };
        try {
            const result = await write("notes", newNote);
            setStatus(`Note written successfully. ID: ${result.ids?.[0] ?? "N/A"}`);
            console.log("[AppPage] Note written:", result);
            handleReadNotesOnce(); // Re-read notes after write
        } catch (error) {
            console.error("[AppPage] Error writing note:", error);
            setStatus(`Error writing note: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [write, activeIdentity, handleReadNotesOnce]); // Added handleReadNotesOnce dependency

    // --- Subscription Effect ---
    // useEffect(() => {
    //     // Subscription depends on the 'read' function from useVibe and the activeIdentity
    //     // It should only run when 'read' is available (implies VibeProvider is ready)
    //     // and when activeIdentity changes.
    //     if (!read || !activeIdentity) {
    //         // Clear tasks if identity becomes null or 'read' is not available
    //         setTasks([]);
    //         if (taskSubscription.current) {
    //             console.log("[AppPage] Cleaning up task subscription due to missing read/identity.");
    //             taskSubscription.current();
    //             taskSubscription.current = null;
    //         }
    //         setStatus(activeIdentity ? "Vibe ready, waiting for read function..." : "No active identity for subscription.");
    //         return;
    //     }

    //     console.log("[AppPage] Active Identity changed or read function available. Setting up subscription for:", activeIdentity.did);
    //     setStatus("Subscribing to tasks...");
    //     let isMounted = true;

    //     const subscribeToTasks = async () => {
    //         // Cleanup previous subscription before starting new one
    //         if (taskSubscription.current) {
    //             await taskSubscription.current();
    //             taskSubscription.current = null;
    //         }

    //         try {
    //             taskSubscription.current = await read("tasks", undefined, (result) => {
    //                 if (isMounted) {
    //                     console.log("[AppPage] Task subscription update:", result.data);
    //                     setTasks(result.data || []);
    //                     setStatus("Task subscription active.");
    //                 }
    //             });
    //             console.log("[AppPage] Subscribed to tasks.");
    //         } catch (error) {
    //             console.error("[AppPage] Error subscribing to tasks:", error);
    //             if (isMounted) {
    //                 setStatus(`Error subscribing to tasks: ${error instanceof Error ? error.message : String(error)}`);
    //                 setTasks([]);
    //             }
    //         }
    //     };

    //     subscribeToTasks();

    //     // Cleanup function for when component unmounts or dependencies change
    //     return () => {
    //         isMounted = false;
    //         console.log("[AppPage] Cleaning up task subscription effect...");
    //         if (taskSubscription.current) {
    //             taskSubscription.current();
    //             taskSubscription.current = null;
    //             console.log("[AppPage] Task subscription cleaned up.");
    //         }
    //         // Don't reset status here, as it might be misleading during identity switch
    //     };
    //     // Depend on read function stability and activeIdentity DID
    // }, [read, activeIdentity]); // Re-run if read function changes or activeIdentity changes

    return (
        <>
            {/* Status Card */}
            <Card className="bg-card/50 backdrop-blur-sm border-muted mb-6">
                <CardHeader>
                    <CardTitle>App Status & Vibe Identity</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-2">
                        Vibe Active Identity (from VibeProvider):{" "}
                        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
                            {activeIdentity?.label ?? "None"} ({activeIdentity?.did ?? "N/A"})
                        </code>
                    </p>
                    <p>
                        App Status: <span className="italic">{status}</span>
                    </p>
                </CardContent>
            </Card>

            {/* Notes & Tasks Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Notes Section */}
                <Card className="bg-card/50 backdrop-blur-sm border-muted">
                    <CardHeader>
                        <CardTitle>Notes (Read Once / Write)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-2 mb-4">
                            <Button onClick={handleReadNotesOnce} disabled={!activeIdentity}>
                                Read Notes Once
                            </Button>
                            <Button onClick={handleWriteNote} variant="secondary" disabled={!activeIdentity}>
                                Write New Note
                            </Button>
                        </div>
                        <h3 className="font-semibold mb-2">Notes Data:</h3>
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-60">
                            {notes.length > 0 ? JSON.stringify(notes, null, 2) : "No notes loaded."}
                        </pre>
                    </CardContent>
                </Card>

                {/* Tasks Section */}
                {/* <Card className="bg-card/50 backdrop-blur-sm border-muted">
                    <CardHeader>
                        <CardTitle>Notes (Subscription / Write)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-2 mb-4">
                            <Button onClick={handleWriteTask} variant="secondary" disabled={!activeIdentity}>
                                Write New Task
                            </Button>
                        </div>
                        <p className="text-sm mb-2 text-muted-foreground">Task data should update automatically via subscription.</p>
                        <h3 className="font-semibold mb-2">Tasks Data:</h3>
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-60">
                            {tasks.length > 0 ? JSON.stringify(tasks, null, 2) : "No tasks loaded."}
                        </pre>
                    </CardContent>
                </Card> */}
            </div>
        </>
    );
}

// --- Page Component ---
// This component wraps the AppContent with the VibeProvider,
// effectively initializing the Vibe SDK interaction for this "page" or "site".
function NotesPage() {
    return (
        <VibeProvider manifest={notesAppManifest}>
            <AppContent />
        </VibeProvider>
    );
}

export default NotesPage;
