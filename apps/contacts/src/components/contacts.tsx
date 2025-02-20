import React, { useState } from "react";
import { vibe } from "vibe-sdk";
import { useVibe } from "./vibe-context";

interface Contact {
    _id?: string;
    name: string;
    phone?: string;
}

export default function Contacts() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { account, readOnce, write } = useVibe();

    async function handleLoadContacts() {
        setLoading(true);
        setError(null);
        try {
            // Call vibe.readOnce with collection “contacts”
            const result = await readOnce("contacts");
            const docs = result?.docs || [];
            setContacts(docs);
        } catch (err: unknown) {
            console.error("Error reading contacts:", err);
            setError(err instanceof Error ? err.message : "Failed to read contacts");
        } finally {
            setLoading(false);
        }
    }

    // Mock an “add contact” feature by calling vibe.write
    async function handleAddContact() {
        try {
            const newContact = {
                name: "John Doe " + Date.now(),
                phone: "(123) 456-7890",
            };
            const result = await write("contacts", newContact);
            console.log("Write result", result);
            // Optionally reload contacts
            //await handleLoadContacts();
        } catch (err) {
            console.error("Error writing contact:", err);
            setError(err instanceof Error ? err.message : "Failed to write contact");
        }
    }

    if (!account) {
        return null;
    }

    return (
        <div className="p-4 flex flex-col gap-2">
            <div className="text-4xl">Contacts</div>
            <div className="">{account?.name}</div>
            <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full" onClick={handleLoadContacts} disabled={loading}>
                {loading ? "Loading..." : "Load Contacts"}
            </button>
            <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full" onClick={handleAddContact}>
                Add Contact
            </button>
            {error && <div style={{ color: "red", marginTop: 8 }}>Error: {error}</div>}

            <ul style={{ marginTop: 20 }}>
                {contacts.map((c) => (
                    <li key={c._id || c.name}>
                        {c.name} {c.phone && <span>({c.phone})</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
}
