import React, { useState, useEffect } from "react";
import { useVibe } from "../vibe/react"; // Assuming useVibe provides SDK functions
import type { Note } from "../vibe/types"; // Import the Note type

const NotesPage: React.FC = () => {
    const { readOnce, write, activeIdentity, permissions } = useVibe(); // Changed: Destructure readOnce and write directly
    const [notes, setNotes] = useState<Note[]>([]);
    const [newNoteTitle, setNewNoteTitle] = useState("");
    const [newNoteContent, setNewNoteContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canReadNotes = permissions?.["read:notes"] === "always" || permissions?.["read:notes"] === "ask";
    const canWriteNotes = permissions?.["write:notes"] === "always" || permissions?.["write:notes"] === "ask";

    // Effect to load notes when the component mounts or SDK/identity changes
    useEffect(() => {
        const loadNotes = async () => {
            if (readOnce && activeIdentity && canReadNotes) {
                // Changed: Check for readOnce
                setIsLoading(true);
                setError(null);
                try {
                    // TODO: Replace with actual SDK call: readOnce('notes')
                    // For now, using a placeholder or local storage if needed
                    console.log("Attempting to load notes (currently mock)");
                    // const result = await readOnce<Note>('notes'); // Changed: Call readOnce directly
                    // if (result.ok) {
                    //     setNotes(result.data);
                    // } else {
                    //     setError(result.error || 'Failed to load notes');
                    // }
                    // Mock data for now:
                    setNotes([
                        { _id: "1", title: "Mock Note 1", content: "This is a mock note.", createdAt: new Date().toISOString() },
                        { _id: "2", title: "Mock Note 2", content: "Another mock note for UI testing.", createdAt: new Date().toISOString() },
                    ]);
                } catch (e: any) {
                    setError(e.message || "An unexpected error occurred while loading notes.");
                    console.error("Error loading notes:", e);
                } finally {
                    setIsLoading(false);
                }
            } else if (activeIdentity && !canReadNotes) {
                setError("You do not have permission to read notes.");
                setNotes([]);
            }
        };

        loadNotes();
    }, [readOnce, activeIdentity, permissions]); // Changed: readOnce in dependency array, permissions included to re-check if they change

    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNoteTitle.trim() || !newNoteContent.trim()) {
            setError("Title and content cannot be empty.");
            return;
        }
        if (write && activeIdentity && canWriteNotes) {
            // Changed: Check for write
            setIsLoading(true);
            setError(null);
            const noteToAdd: Omit<Note, "_id" | "createdAt" | "updatedAt"> = {
                title: newNoteTitle,
                content: newNoteContent,
            };
            try {
                // TODO: Replace with actual SDK call: write('notes', noteToAdd)
                console.log("Attempting to add note (currently mock):", noteToAdd);
                // const result = await write<Note>('notes', noteToAdd); // Changed: Call write directly
                // if (result.ok && result.ids.length > 0) {
                //     const createdNoteId = result.ids[0];
                //     // Optimistically add or re-fetch:
                //     // For simplicity, mock adding it with a temp ID or re-fetch.
                //     // Here, we'll just add it to local state with a mock ID.
                //     setNotes(prevNotes => [...prevNotes, { ...noteToAdd, _id: createdNoteId || `temp-${Date.now()}`, createdAt: new Date().toISOString() }]);
                //     setNewNoteTitle('');
                //     setNewNoteContent('');
                // } else {
                //     setError(result.errors?.[0]?.error || 'Failed to add note');
                // }
                // Mock behavior:
                const mockAddedNote: Note = {
                    ...noteToAdd,
                    _id: `mock-${Date.now()}`,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                setNotes((prevNotes) => [...prevNotes, mockAddedNote]);
                setNewNoteTitle("");
                setNewNoteContent("");
            } catch (e: any) {
                setError(e.message || "An unexpected error occurred while adding the note.");
                console.error("Error adding note:", e);
            } finally {
                setIsLoading(false);
            }
        } else if (!canWriteNotes) {
            setError("You do not have permission to write notes.");
        } else if (!activeIdentity) {
            setError("No active identity. Please connect and select an identity.");
        }
    };

    if (!activeIdentity) {
        return <div>Please initialize the Vibe connection and select an identity to manage notes.</div>;
    }

    return (
        <div style={{ padding: "20px" }}>
            <h1>My Notes</h1>
            {error && <p style={{ color: "red" }}>Error: {error}</p>}

            {canWriteNotes && (
                <form onSubmit={handleAddNote} style={{ marginBottom: "20px" }}>
                    <div>
                        <input
                            type="text"
                            placeholder="Note Title"
                            value={newNoteTitle}
                            onChange={(e) => setNewNoteTitle(e.target.value)}
                            disabled={isLoading}
                            style={{ marginRight: "10px", padding: "8px", minWidth: "200px" }}
                        />
                    </div>
                    <div style={{ marginTop: "10px" }}>
                        <textarea
                            placeholder="Note Content"
                            value={newNoteContent}
                            onChange={(e) => setNewNoteContent(e.target.value)}
                            disabled={isLoading}
                            style={{ padding: "8px", minWidth: "300px", minHeight: "80px" }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading || !newNoteTitle.trim() || !newNoteContent.trim()}
                        style={{ marginTop: "10px", padding: "8px 15px" }}
                    >
                        {isLoading ? "Adding..." : "Add Note"}
                    </button>
                </form>
            )}
            {!canWriteNotes && activeIdentity && (
                <p>
                    <em>You do not have permission to add new notes.</em>
                </p>
            )}

            <h2>Notes List</h2>
            {isLoading && <p>Loading notes...</p>}
            {!isLoading && !canReadNotes && activeIdentity && (
                <p>
                    <em>You do not have permission to view notes.</em>
                </p>
            )}
            {!isLoading && canReadNotes && notes.length === 0 && <p>No notes found. {canWriteNotes ? "Try adding one!" : ""}</p>}
            {!isLoading && canReadNotes && notes.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0 }}>
                    {notes.map((note) => (
                        <li key={note._id} style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px", borderRadius: "4px" }}>
                            <h3>{note.title}</h3>
                            <p>{note.content}</p>
                            <small>Created: {note.createdAt ? new Date(note.createdAt).toLocaleString() : "N/A"}</small>
                            {/* TODO: Add edit/delete functionality later */}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default NotesPage;
