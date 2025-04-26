// App.tsx - Main application file for the Vibe mock integration test
import { useState, useEffect, useCallback, useRef } from "react";
import "./index.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useVibe } from "./vibe/react"; // Import useVibe hook
import { IdentityPanel } from "./components/agent/IdentityPanel"; // Import IdentityPanel
import type { Unsubscribe } from "./vibe/types";

// Remove logo imports if not used
// import logo from "./logo.svg";
export function App() {
    // Get full state and methods from useVibe
    const { account, identities, activeIdentity, readOnce, read, write, createIdentity, setActiveIdentity } = useVibe();
    const [notes, setNotes] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [status, setStatus] = useState<string>("Initializing...");
    const taskSubscription = useRef<Unsubscribe | null>(null); // Ref to hold unsubscribe function

    // --- Handlers ---

    const handleReadNotesOnce = useCallback(async () => {
        if (!account) {
            setStatus("Account not initialized. Cannot read notes.");
            console.warn("[App] Attempted to read notes before account was ready.");
            return;
        }
        setStatus("Reading notes...");
        try {
            // Use readOnce from useVibe context
            const result = await readOnce("notes"); // result is of type ReadResult<any>
            setNotes(result.data || []); // Access result.data instead of result.docs
            setStatus("Notes read successfully.");
            console.log("[App] Notes read:", result.data); // Log result.data
        } catch (error) {
            console.error("[App] Error reading notes:", error);
            setStatus(`Error reading notes: ${error instanceof Error ? error.message : String(error)}`);
            setNotes([]);
        }
    }, [readOnce, account]); // Add account to dependency array

    const handleWriteNote = useCallback(async () => {
        if (!account) {
            setStatus("Account not initialized. Cannot write note.");
            console.warn("[App] Attempted to write note before account was ready.");
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
            console.log("[App] Note written:", result);
            // Optionally re-read notes after write
            handleReadNotesOnce();
        } catch (error) {
            console.error("[App] Error writing note:", error);
            setStatus(`Error writing note: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [write, account]);

    const handleWriteTask = useCallback(async () => {
        if (!account) {
            setStatus("Account not initialized. Cannot write task.");
            console.warn("[App] Attempted to write task before account was ready.");
            return;
        }
        setStatus("Writing new task...");
        const newTask = {
            text: `New task added at ${new Date().toLocaleTimeString()}`,
            createdAt: new Date().toISOString(),
        };
        try {
            const result = await write("tasks", newTask);
            setStatus(`Task written successfully. ID: ${result.ids?.[0] ?? "N/A"}`);
            console.log("[App] Task written:", result);
        } catch (error) {
            console.error("[App] Error writing task:", error);
            setStatus(`Error writing task: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [write, account]); // Add account to dependency array

    // --- Subscription Effect ---

    useEffect(() => {
        if (!account) {
            setStatus("No active identity found. Waiting for initialization...");
            return;
        }
        // Use activeIdentity for logging or display if needed
        console.log("[App] Active Identity found:", JSON.stringify(activeIdentity));

        setStatus("Subscribing to tasks...");
        let isMounted = true; // Flag to prevent state updates after unmount

        const subscribeToTasks = async () => {
            try {
                // Ensure previous subscription is cleaned up if effect re-runs
                if (taskSubscription.current) {
                    await taskSubscription.current(); // Ensure unsubscribe completes if async
                    taskSubscription.current = null;
                }

                taskSubscription.current = await read("tasks", undefined, (result) => {
                    // result is ReadResult<any>
                    if (isMounted) {
                        console.log("[App] Task subscription update:", result.data); // Access result.data
                        setTasks(result.data || []); // Access result.data
                        setStatus("Task subscription active.");
                    }
                });
                console.log("[App] Subscribed to tasks.");
            } catch (error) {
                console.error("[App] Error subscribing to tasks:", error);
                if (isMounted) {
                    setStatus(`Error subscribing to tasks: ${error instanceof Error ? error.message : String(error)}`);
                    setTasks([]);
                }
            }
        };

        subscribeToTasks();

        // Cleanup function
        return () => {
            isMounted = false;
            console.log("[App] Cleaning up task subscription...");
            if (taskSubscription.current) {
                taskSubscription.current();
                taskSubscription.current = null;
                console.log("[App] Task subscription cleaned up.");
            }
            setStatus("Task subscription stopped.");
        };
        // Depend on activeIdentity as well, so subscription restarts if identity changes
    }, [read, activeIdentity]);

    // --- Identity Panel Handlers ---
    const handleCreateIdentity = useCallback(async () => {
        // Simple prompt for now, could be a modal later
        const label = prompt("Enter a label for the new identity:", `Identity ${identities ? identities.length + 1 : 1}`);
        if (label) {
            setStatus("Creating new identity...");
            try {
                await createIdentity(label);
                setStatus("New identity created.");
            } catch (error) {
                console.error("Error creating identity:", error);
                setStatus(`Error creating identity: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }, [createIdentity, identities]);

    const handleSwitchIdentity = useCallback(
        async (did: string) => {
            setStatus(`Switching identity to ${did}...`);
            try {
                await setActiveIdentity(did);
                setStatus("Identity switched.");
                // Clear old data when switching identity
                setNotes([]);
                setTasks([]);
            } catch (error) {
                console.error("Error switching identity:", error);
                setStatus(`Error switching identity: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        [setActiveIdentity]
    );

    const handleManagePermissions = useCallback(() => {
        // TODO: Implement navigation or modal opening for permission manager
        alert("Permission Management UI not implemented yet.");
        console.log("Navigate to Permission Management UI");
    }, []);

    return (
        <div className="container mx-auto p-8 text-left relative z-10">
            {/* Header with Identity Panel */}
            <header className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Vibe Test App</h1>
                <IdentityPanel
                    identities={identities ?? []}
                    activeIdentity={activeIdentity ?? null}
                    onCreateIdentity={handleCreateIdentity}
                    onSwitchIdentity={handleSwitchIdentity}
                    onManagePermissions={handleManagePermissions}
                />
            </header>

            <Card className="bg-card/50 backdrop-blur-sm border-muted mb-6">
                <CardHeader>
                    <CardTitle>Status & Active Identity</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-2">
                        Active Identity:{" "}
                        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
                            {activeIdentity?.label ?? "None"} ({activeIdentity?.did ?? "N/A"})
                        </code>
                    </p>
                    <p>
                        Status: <span className="italic">{status}</span>
                    </p>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Notes Section */}
                <Card className="bg-card/50 backdrop-blur-sm border-muted">
                    <CardHeader>
                        <CardTitle>Notes (Read Once / Write)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-2 mb-4">
                            <Button onClick={handleReadNotesOnce} disabled={!account}>
                                Read Notes Once
                            </Button>
                            <Button onClick={handleWriteNote} variant="secondary" disabled={!account}>
                                Write New Note
                            </Button>
                            <Button onClick={handleWriteTask} variant="secondary" disabled={!account}>
                                Write New Task
                            </Button>
                        </div>
                        <h3 className="font-semibold mb-2">Notes Data:</h3>
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-60">
                            {notes.length > 0 ? JSON.stringify(notes, null, 2) : "No notes loaded."}
                        </pre>
                    </CardContent>
                </Card>

                {/* Tasks Section */}
                <Card className="bg-card/50 backdrop-blur-sm border-muted">
                    <CardHeader>
                        <CardTitle>Tasks (Subscription)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm mb-2 text-muted-foreground">
                            Task data should update automatically via subscription (check console logs from Mock Agent/SDK).
                        </p>
                        <h3 className="font-semibold mb-2">Tasks Data:</h3>
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-60">
                            {tasks.length > 0 ? JSON.stringify(tasks, null, 2) : "No tasks loaded."}
                        </pre>
                    </CardContent>
                </Card>
            </div>

            {/* Original content commented out */}
            {/* <Card className="bg-card/50 backdrop-blur-sm border-muted">
        <CardContent className="pt-6">
          <h1 className="text-5xl font-bold my-4 leading-tight">Bun + React</h1>
          <p>
            Edit{" "}
            <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
              src/App.tsx
            </code>{" "}
            and save to test HMR
          </p>
          <APITester />
        </CardContent>
      </Card> */}
        </div>
    );
}

export default App;
