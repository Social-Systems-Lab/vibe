// apps/test/src/pages/AppPage.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import type { ChangeEvent, FormEvent } from "react"; // Type-only imports
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useVibe, VibeProvider } from "vibe-react";
import type { Unsubscribe, AppManifest } from "vibe-sdk"; // Assuming NoteDoc might be added here later
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
    const { activeIdentity, readOnce, read, write } = useVibe(); // Added `read` back for subscriptions
    const [notes, setNotes] = useState<NoteDoc[]>([]);
    const [newNoteTitle, setNewNoteTitle] = useState<string>("");
    const [newNoteContent, setNewNoteContent] = useState<string>("");
    const [editingNote, setEditingNote] = useState<NoteDoc | null>(null);
    const [status, setStatus] = useState<string>("Initializing VibeProvider...");
    const notesSubscription = useRef<Unsubscribe | null>(null); // Changed from taskSubscription

    // --- Effect to update status based on active identity ---
    useEffect(() => {
        if (activeIdentity) {
            setStatus("VibeProvider initialized. Ready.");
            // Initial load will be handled by the subscription effect now
        } else {
            setStatus("Waiting for Vibe initialization...");
            setNotes([]); // Clear notes if no active identity
        }
    }, [activeIdentity]);

    // --- Handlers (using methods from useVibe) ---
    // handleReadNotesOnce can be kept for manual refresh button, or removed if subscription is sole source
    const handleReadNotesOnce = useCallback(async () => {
        if (!activeIdentity) {
            setStatus("Active identity not initialized. Cannot read notes.");
            return;
        }
        setStatus("Refreshing notes manually...");
        try {
            const result = await readOnce("notes"); // No filter, get all notes
            setNotes((result.data as NoteDoc[]) || []); // Update notes state
            setStatus(result.data?.length ? "Notes refreshed successfully." : "No notes found or empty.");
            console.log("[AppPage] Notes read manually:", result.data);
        } catch (error) {
            console.error("[AppPage] Error reading notes manually:", error);
            setStatus(`Error refreshing notes: ${error instanceof Error ? error.message : String(error)}`);
            // Do not clear notes here, let subscription handle it or keep existing
        }
    }, [readOnce, activeIdentity]);

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
                // Notes will be updated by subscription, no need for manual re-read here
                // handleReadNotesOnce();
            } catch (error) {
                console.error("[AppPage] Error writing/updating note:", error);
                setStatus(`Error writing/updating note: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        [write, activeIdentity, newNoteTitle, newNoteContent, editingNote] // Removed handleReadNotesOnce
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
                // Notes will be updated by subscription
                // handleReadNotesOnce();
            } catch (error) {
                console.error(`[AppPage] Error deleting note ${noteId}:`, error);
                setStatus(`Error deleting note: ${error instanceof Error ? error.message : String(error)}`);
            }
        },
        [write, activeIdentity] // Removed handleReadNotesOnce
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

    // --- Notes Subscription Effect ---
    useEffect(() => {
        if (!read || !activeIdentity) {
            setNotes([]); // Clear notes if identity becomes null or 'read' is not available
            if (notesSubscription.current) {
                console.log("[AppPage] Cleaning up notes subscription due to missing read/identity.");
                notesSubscription.current();
                notesSubscription.current = null;
            }
            setStatus(activeIdentity ? "Vibe ready, waiting for read function for notes..." : "No active identity for notes subscription.");
            return;
        }

        console.log("[AppPage] Active Identity changed or read function available. Setting up notes subscription for:", activeIdentity.did);
        setStatus("Subscribing to notes...");
        let isMounted = true;

        const subscribeToNotes = async () => {
            if (notesSubscription.current) {
                await notesSubscription.current(); // Ensure previous is cleaned up
                notesSubscription.current = null;
            }

            try {
                // Subscribe to the "notes" collection. No specific filter means all notes for the user.
                // The callback will receive ReadResult<NoteDoc[]>
                notesSubscription.current = await read("notes", undefined, (result) => {
                    if (isMounted) {
                        if (result.ok && result.data) {
                            console.log("[AppPage] Notes subscription update:", result.data);
                            setNotes(result.data as NoteDoc[]); // Cast to NoteDoc[]
                            setStatus(result.data.length ? "Notes subscription active." : "Notes subscription active. No notes yet.");
                        } else if (!result.ok) {
                            console.error("[AppPage] Notes subscription error update:", result.error);
                            setStatus(`Error in notes subscription: ${result.error || "Unknown error"}`);
                            // Optionally clear notes or handle error display
                        }
                    }
                });
                console.log("[AppPage] Subscribed to notes.");
                // Initial data should be sent by the subscription handler itself upon connection.
                // If not, a readOnce might be needed here, or the subscription handler enhanced.
                // For now, assuming subscription sends initial data.
            } catch (error) {
                console.error("[AppPage] Error subscribing to notes:", error);
                if (isMounted) {
                    setStatus(`Error subscribing to notes: ${error instanceof Error ? error.message : String(error)}`);
                    setNotes([]);
                }
            }
        };

        subscribeToNotes();

        return () => {
            isMounted = false;
            console.log("[AppPage] Cleaning up notes subscription effect...");
            if (notesSubscription.current) {
                notesSubscription.current();
                notesSubscription.current = null;
                console.log("[AppPage] Notes subscription cleaned up.");
            }
        };
    }, [read, activeIdentity]); // Depend on read function and activeIdentity

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
