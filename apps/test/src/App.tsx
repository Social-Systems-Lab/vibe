import { useState, useEffect, useCallback, useRef } from "react";
import "./index.css";
// import { APITester } from "./APITester"; // Comment out for now
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button"; // Import Button
import { useVibe } from "./vibe/react"; // Import useVibe
import type { Unsubscribe } from "./vibe/types"; // Import Unsubscribe type

// Remove logo imports if not used
// import logo from "./logo.svg";
// import reactLogo from "./react.svg";

export function App() {
    const { account, readOnce, read, write } = useVibe(); // Use the hook
    const [notes, setNotes] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [status, setStatus] = useState<string>("");
    const taskSubscription = useRef<Unsubscribe | null>(null); // Ref to hold unsubscribe function

    // --- Handlers ---

    const handleReadNotesOnce = useCallback(async () => {
        setStatus("Reading notes...");
        try {
            const result = await readOnce("notes");
            setNotes(result.docs || []);
            setStatus("Notes read successfully.");
            console.log("[App] Notes read:", result.docs);
        } catch (error) {
            console.error("[App] Error reading notes:", error);
            setStatus(`Error reading notes: ${error instanceof Error ? error.message : String(error)}`);
            setNotes([]);
        }
    }, [readOnce]);

    const handleWriteNote = useCallback(async () => {
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
            // handleReadNotesOnce();
        } catch (error) {
            console.error("[App] Error writing note:", error);
            setStatus(`Error writing note: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [write]); // Removed handleReadNotesOnce from dependency array to avoid potential loops if re-read is added

    // --- Subscription Effect ---

    useEffect(() => {
        setStatus("Subscribing to tasks...");
        let isMounted = true; // Flag to prevent state updates after unmount

        const subscribeToTasks = async () => {
            try {
                // Ensure previous subscription is cleaned up if effect re-runs
                if (taskSubscription.current) {
                    taskSubscription.current();
                    taskSubscription.current = null;
                }

                taskSubscription.current = await read("tasks", undefined, (result) => {
                    if (isMounted) {
                        console.log("[App] Task subscription update:", result.docs);
                        setTasks(result.docs || []);
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
    }, [read]); // Dependency array includes 'read' from useVibe

    return (
        <div className="container mx-auto p-8 text-left relative z-10">
            {/* Keep header if desired, or remove */}
            {/* <div className="flex justify-center items-center gap-8 mb-8"> ... logos ... </div> */}

            <Card className="bg-card/50 backdrop-blur-sm border-muted mb-6">
                <CardHeader>
                    <CardTitle>Vibe Mock Integration Test</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="mb-4">
                        Account DID:{" "}
                        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">{account?.userDid || "Loading..."}</code>
                    </p>
                    <p className="mb-4">
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
                            <Button onClick={handleReadNotesOnce}>Read Notes Once</Button>
                            <Button onClick={handleWriteNote} variant="secondary">
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
