// contacts.tsx - Enhanced contact list and management
import { useEffect, useState, useMemo } from "react";
import { useVibe } from "vibe-react";
import { IoMdAdd, IoMdClose, IoMdMail, IoMdCall } from "react-icons/io";
import { HiDotsVertical } from "react-icons/hi";

interface Contact {
    _id?: string;
    name: string;
    phone?: string;
    email?: string;
}

// Generate a consistent color based on a string (name)
function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const colors = ["#3498db", "#2ecc71", "#e74c3c", "#f39c12", "#9b59b6", "#1abc9c", "#d35400", "#c0392b", "#8e44ad", "#16a085"];

    // Use the hash to select a color
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

// Get initials from a name
function getInitials(name: string): string {
    if (!name) return "?";
    return name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}

export default function Contacts() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [newContact, setNewContact] = useState<Contact>({ name: "", phone: "", email: "" });
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAddMode, setIsAddMode] = useState(false);
    const { account, read, write } = useVibe();

    // Sort contacts alphabetically
    const sortedContacts = useMemo(() => {
        return [...contacts].sort((a, b) => a.name.localeCompare(b.name));
    }, [contacts]);

    // Create a new contact
    async function handleAddContact() {
        try {
            if (!newContact.name.trim()) {
                setError("Contact name is required");
                return;
            }

            const result = await write("contacts", newContact);
            console.log("Write result", result);

            // Close modal and reset form
            setIsModalOpen(false);
            setNewContact({ name: "", phone: "", email: "" });
            setIsAddMode(false);
        } catch (err) {
            console.error("Error writing contact:", err);
            setError(err instanceof Error ? err.message : "Failed to write contact");
        }
    }

    // Delete a contact
    async function handleDeleteContact(contact: Contact) {
        try {
            if (!contact._id) return;

            // To delete, we need to add _deleted: true
            await write("contacts", { ...contact, _deleted: true });
            setIsModalOpen(false);
        } catch (err) {
            console.error("Error deleting contact:", err);
            setError(err instanceof Error ? err.message : "Failed to delete contact");
        }
    }

    // Save edited contact
    async function handleSaveContact() {
        try {
            if (!selectedContact) return;
            if (!selectedContact.name.trim()) {
                setError("Contact name is required");
                return;
            }

            await write("contacts", selectedContact);
            setIsModalOpen(false);
        } catch (err) {
            console.error("Error updating contact:", err);
            setError(err instanceof Error ? err.message : "Failed to update contact");
        }
    }

    // Open add contact modal
    function handleOpenAddModal() {
        setNewContact({ name: "", phone: "", email: "" });
        setIsAddMode(true);
        setIsModalOpen(true);
    }

    // Open edit contact modal
    function handleOpenEditModal(contact: Contact) {
        setSelectedContact({ ...contact });
        setIsAddMode(false);
        setIsModalOpen(true);
    }

    useEffect(() => {
        if (!account) return;

        setLoading(true);
        try {
            // Subscribe to the contacts collection
            const unsubscribe = read("contacts", {}, (result: any) => {
                console.log("Received contacts update:", result);
                setContacts(result.docs || []);
                setLoading(false);
            });

            // Return cleanup function to unsubscribe when component unmounts
            return () => {
                unsubscribe();
            };
        } catch (err) {
            console.error("Error subscribing to contacts:", err);
            setError(err instanceof Error ? err.message : "Failed to subscribe to contacts");
            setLoading(false);
        }
    }, [account, read]);

    return (
        <div className="bg-gray-50 min-h-screen">
            {/* Header */}
            <header className="bg-white py-4 px-6 border-b border-gray-200 flex justify-between items-center">
                <h1 className="text-xl font-semibold">Contacts</h1>
                <div className="flex gap-2">
                    <button className="p-2 rounded-full hover:bg-gray-100" onClick={() => {}}>
                        <HiDotsVertical className="text-gray-600" />
                    </button>
                </div>
            </header>

            {account && (
                <>
                    {/* Error display */}
                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mx-4 mt-4" role="alert">
                            <span className="block sm:inline">{error}</span>
                            <button className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
                                <span className="text-xl">&times;</span>
                            </button>
                        </div>
                    )}

                    {/* Contacts list */}
                    <div className="px-4 py-2">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
                            </div>
                        ) : sortedContacts.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">
                                <p className="mb-4">No contacts found</p>
                                <button className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors" onClick={handleOpenAddModal}>
                                    Add Your First Contact
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-200">
                                {sortedContacts.map((contact) => (
                                    <li key={contact._id} className="py-3 px-2 flex items-center hover:bg-gray-50 rounded-lg cursor-pointer" onClick={() => handleOpenEditModal(contact)}>
                                        {/* Contact Avatar */}
                                        <div
                                            className="w-10 h-10 rounded-full flex items-center justify-center mr-3 text-white font-medium text-sm"
                                            style={{ backgroundColor: stringToColor(contact.name) }}
                                        >
                                            {getInitials(contact.name)}
                                        </div>

                                        {/* Contact Info */}
                                        <div className="flex-1">
                                            <h3 className="text-sm font-medium">{contact.name}</h3>
                                            <p className="text-xs text-gray-500 truncate">{contact.email || contact.phone || "No contact info"}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Floating Action Button */}
                    <button
                        className="fixed right-6 bottom-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 transition-colors rounded-full flex items-center justify-center shadow-lg"
                        onClick={handleOpenAddModal}
                    >
                        <IoMdAdd className="text-white text-2xl" />
                    </button>

                    {/* Contact Detail/Edit Modal */}
                    {isModalOpen && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                            <div className="bg-white rounded-lg w-full max-w-md mx-4 overflow-hidden shadow-xl transform transition-all">
                                {/* Modal Header */}
                                <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                                    <h2 className="text-lg font-semibold">{isAddMode ? "Add Contact" : "Edit Contact"}</h2>
                                    <button className="text-gray-500 hover:text-gray-700" onClick={() => setIsModalOpen(false)}>
                                        <IoMdClose className="text-xl" />
                                    </button>
                                </div>

                                {/* Modal Content */}
                                <div className="p-4">
                                    {/* Avatar Display */}
                                    <div className="flex justify-center mb-6">
                                        <div
                                            className="w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-medium"
                                            style={{
                                                backgroundColor: stringToColor(isAddMode ? newContact.name || "New Contact" : selectedContact?.name || ""),
                                            }}
                                        >
                                            {getInitials(isAddMode ? newContact.name || "New Contact" : selectedContact?.name || "")}
                                        </div>
                                    </div>

                                    {/* Form Fields */}
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Name*</label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                value={isAddMode ? newContact.name : selectedContact?.name || ""}
                                                onChange={(e) =>
                                                    isAddMode ? setNewContact({ ...newContact, name: e.target.value }) : setSelectedContact((prev) => (prev ? { ...prev, name: e.target.value } : null))
                                                }
                                                placeholder="Contact name"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <IoMdCall className="text-gray-400" />
                                                </div>
                                                <input
                                                    type="tel"
                                                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    value={isAddMode ? newContact.phone || "" : selectedContact?.phone || ""}
                                                    onChange={(e) =>
                                                        isAddMode
                                                            ? setNewContact({ ...newContact, phone: e.target.value })
                                                            : setSelectedContact((prev) => (prev ? { ...prev, phone: e.target.value } : null))
                                                    }
                                                    placeholder="Phone number"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <IoMdMail className="text-gray-400" />
                                                </div>
                                                <input
                                                    type="email"
                                                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    value={isAddMode ? newContact.email || "" : selectedContact?.email || ""}
                                                    onChange={(e) =>
                                                        isAddMode
                                                            ? setNewContact({ ...newContact, email: e.target.value })
                                                            : setSelectedContact((prev) => (prev ? { ...prev, email: e.target.value } : null))
                                                    }
                                                    placeholder="Email address"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between">
                                    {!isAddMode && (
                                        <button
                                            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 focus:outline-none"
                                            onClick={() => selectedContact && handleDeleteContact(selectedContact)}
                                        >
                                            Delete
                                        </button>
                                    )}
                                    <div className="flex gap-2 ml-auto">
                                        <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none" onClick={() => setIsModalOpen(false)}>
                                            Cancel
                                        </button>
                                        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none" onClick={isAddMode ? handleAddContact : handleSaveContact}>
                                            {isAddMode ? "Add" : "Save"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
