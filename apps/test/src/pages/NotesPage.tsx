// apps/test/src/pages/AppPage.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import type { ChangeEvent, FormEvent } from "react"; // Type-only imports
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useVibe, VibeProvider } from "../vibe/react.tsx";
import type { Unsubscribe, AppManifest } from "../vibe/types.ts"; // Assuming NoteDoc might be added here later
import logoSvg from "../logo.svg";

// Define NoteDoc structure, matching pouchdb.ts
interface NoteDoc {
    _id?: string;
    _rev?: string;
    type: "note";
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    userDid: string; // Will be set by the backend/PouchDB layer
}

const notesAppManifest: AppManifest = {
    appId: "notes-test-app", // Unique ID for this application
    name: "Notes Test App",
    description: "Notes application for testing Vibe Protocol integration.",
    permissions: ["read:notes", "write:notes", "delete:notes"], // Added delete permission
    iconUrl: `${window.location.origin}${logoSvg}`,
};

// --- Inner Component using useVibe ---
// This component contains the actual application UI and logic
// that interacts with the Vibe SDK via the useVibe hook.
function AppContent() {
    // Get state and methods from useVibe
    const { activeIdentity, readOnce, write } = useVibe(); // `read` for subscriptions removed for now
    const [notes, setNotes] = useState<NoteDoc[]>([]);
    const [newNoteTitle, setNewNoteTitle] = useState<string>("");
    const [newNoteContent, setNewNoteContent] = useState<string>("");
    const [editingNote, setEditingNote] = useState<NoteDoc | null>(null);
    // const [tasks, setTasks] = useState<any[]>([]); // Tasks functionality commented out
    const [status, setStatus] = useState<string>("Initializing VibeProvider...");
    // const taskSubscription = useRef<Unsubscribe | null>(null); // Tasks functionality commented out

    // --- Effect to update status based on active identity ---
    useEffect(() => {
        if (activeIdentity) {
            setStatus("VibeProvider initialized. Ready.");
            handleReadNotesOnce(); // Load notes when identity is active
        } else {
            setStatus("Waiting for Vibe initialization...");
            setNotes([]); // Clear notes if no active identity
        }
    }, [activeIdentity]); // Removed handleReadNotesOnce from here to avoid loop, called directly above

    // --- Handlers (using methods from useVibe) ---
    const handleReadNotesOnce = useCallback(async () => {
        if (!activeIdentity) {
            setStatus("Active identity not initialized. Cannot read notes.");
            return;
        }
        setStatus("Reading notes...");
        try {
            const result = await readOnce("notes"); // No filter, get all notes
            setNotes((result.data as NoteDoc[]) || []);
            setStatus(result.data?.length ? "Notes read successfully." : "No notes found or empty.");
            console.log("[AppPage] Notes read:", result.data);
        } catch (error) {
            console.error("[AppPage] Error reading notes:", error);
            setStatus(`Error reading notes: ${error instanceof Error ? error.message : String(error)}`);
            setNotes([]);
        }
    }, [readOnce, activeIdentity]);

    // Call handleReadNotesOnce when component mounts and activeIdentity is available
    useEffect(() => {
        if (activeIdentity) {
            handleReadNotesOnce();
        }
    }, [activeIdentity, handleReadNotesOnce]);

    const handleSaveNote = useCallback(
        async (e?: FormEvent) => {
            if (e) e.preventDefault();
            if (!activeIdentity) {
                setStatus("Active identity not initialized. Cannot write note.");
                return;
            }
            if (!newNoteTitle.trim() || !newNoteContent.trim()) {
                setStatus("Note title and content cannot be empty.");
                return;
            }

            setStatus(editingNote ? "Updating note..." : "Writing new note...");
            const now = new Date().toISOString();
            const noteData: Partial<NoteDoc> = {
                _id: editingNote?._id, // Include _id if editing for upsert
                _rev: editingNote?._rev, // Include _rev if editing for upsert
                title: newNoteTitle,
                content: newNoteContent,
                // userDid will be set by backend/PouchDB layer, type also
            };

            if (!editingNote) {
                // Only set createdAt for new notes
                noteData.createdAt = now;
            }
            noteData.updatedAt = now; // Always update updatedAt

            try {
                // `write` function in data.handler now handles upsert based on _id presence
                const result = await write("notes", noteData);
                setStatus(
                    editingNote ? `Note updated successfully. ID: ${result.ids?.[0] ?? "N/A"}` : `Note written successfully. ID: ${result.ids?.[0] ?? "N/A"}`
                );
                console.log("[AppPage] Note written/updated:", result);
                setNewNoteTitle("");
                setNewNoteContent("");
                setEditingNote(null);
                handleReadNotesOnce(); // Re-read notes after write/update
            } catch (error) {
                console.error("[AppPage] Error writing/updating note:", error);
                setStatus(`Error writing/updating note: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        [write, activeIdentity, newNoteTitle, newNoteContent, editingNote, handleReadNotesOnce]
    );

    const handleDeleteNote = useCallback(
        async (noteId?: string) => {
            if (!noteId || !activeIdentity) {
                setStatus("Note ID or active identity missing. Cannot delete.");
                return;
            }
            if (!window.confirm("Are you sure you want to delete this note?")) {
                return;
            }
            setStatus(`Deleting note ${noteId}...`);
            try {
                // Assuming the `write` function can handle a "delete" operation.
                // We'll pass the operation type within the data payload.
                const result = await write("notes", { _id: noteId, operation: "delete" });
                setStatus(`Note deleted: ${result.ids?.[0] ?? "N/A"}`);
                console.log("[AppPage] Note deleted:", result);
                handleReadNotesOnce(); // Refresh notes list
            } catch (error) {
                console.error(`[AppPage] Error deleting note ${noteId}:`, error);
                setStatus(`Error deleting note: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        [write, activeIdentity, handleReadNotesOnce]
    );

    const handleEditNote = (note: NoteDoc) => {
        setEditingNote(note);
        setNewNoteTitle(note.title);
        setNewNoteContent(note.content);
    };

    const handleCancelEdit = () => {
        setEditingNote(null);
        setNewNoteTitle("");
        setNewNoteContent("");
    };

    // --- Subscription Effect (Commented out as per plan for now) ---
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
            {/* Form for New/Edit Note */}
            <Card className="mb-6 bg-card/50 backdrop-blur-sm border-muted">
                <CardHeader>
                    <CardTitle>{editingNote ? "Edit Note" : "Create New Note"}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveNote} className="space-y-4">
                        <div>
                            <label htmlFor="noteTitle" className="block text-sm font-medium text-foreground mb-1">
                                Title
                            </label>
                            <Input
                                id="noteTitle"
                                type="text"
                                value={newNoteTitle}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewNoteTitle(e.target.value)}
                                placeholder="Note title"
                                required
                                className="bg-background/80"
                                disabled={!activeIdentity}
                            />
                        </div>
                        <div>
                            <label htmlFor="noteContent" className="block text-sm font-medium text-foreground mb-1">
                                Content
                            </label>
                            <Textarea
                                id="noteContent"
                                value={newNoteContent}
                                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewNoteContent(e.target.value)}
                                placeholder="Note content..."
                                required
                                className="bg-background/80"
                                rows={4}
                                disabled={!activeIdentity}
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button type="submit" disabled={!activeIdentity || !newNoteTitle.trim() || !newNoteContent.trim()}>
                                {editingNote ? "Save Changes" : "Add Note"}
                            </Button>
                            {editingNote && (
                                <Button type="button" variant="outline" onClick={handleCancelEdit}>
                                    Cancel Edit
                                </Button>
                            )}
                        </div>
                    </form>
                </CardContent>
            </Card>
            {/* Notes List Section */}
            <Card className="bg-card/50 backdrop-blur-sm border-muted">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>My Notes</CardTitle>
                    <Button onClick={handleReadNotesOnce} disabled={!activeIdentity} variant="outline" size="sm">
                        Refresh Notes
                    </Button>
                </CardHeader>
                <CardContent>
                    {notes.length > 0 ? (
                        <ul className="space-y-3">
                            {notes.map((note) => (
                                <li key={note._id} className="p-3 bg-muted/50 rounded-md border">
                                    <h3 className="font-semibold text-lg mb-1">{note.title}</h3>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-2">{note.content}</p>
                                    <p className="text-xs text-muted-foreground/70">
                                        ID: {note._id} <br />
                                        Created: {new Date(note.createdAt).toLocaleString()} <br />
                                        Updated: {new Date(note.updatedAt).toLocaleString()}
                                    </p>
                                    <div className="mt-2 flex gap-2">
                                        <Button onClick={() => handleEditNote(note)} variant="outline" size="sm" disabled={!activeIdentity}>
                                            Edit
                                        </Button>
                                        <Button onClick={() => handleDeleteNote(note._id)} variant="destructive" size="sm" disabled={!activeIdentity}>
                                            Delete
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-muted-foreground">{status.startsWith("Error") ? status : "No notes found. Create one above!"}</p>
                    )}
                </CardContent>
            </Card>
            {/* Tasks Section (Commented out) */}
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
            {/* </div> */} {/* Removed potentially extra closing div tag, assuming the main grid was commented out */}
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
