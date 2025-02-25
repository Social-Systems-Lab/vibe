// share-button.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useVibe } from "./vibe-context";
import { IoMdShare } from "react-icons/io";
import { FaCheck } from "react-icons/fa";

interface Contact {
    _id?: string;
    name: string;
    phone?: string;
    email?: string;
}

export default function ShareButton() {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { account, read } = useVibe();
    const url = typeof window === "undefined" ? "" : window.location.href;

    // Function to determine a consistent color based on name
    function stringToColor(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colors = ["#3498db", "#2ecc71", "#e74c3c", "#f39c12", "#9b59b6", "#1abc9c", "#d35400", "#c0392b", "#8e44ad", "#16a085"];
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    }

    // Get initials from name
    function getInitials(name: string): string {
        if (!name) return "?";
        return name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    }

    useEffect(() => {
        if (!isModalOpen || !account) return;

        setLoading(true);
        try {
            // Load contacts when the modal opens
            const unsubscribe = read("contacts", {}, (result) => {
                console.log("Share component received contacts:", result);
                setContacts(result.docs || []);
                setLoading(false);
            });

            return () => {
                unsubscribe();
            };
        } catch (err) {
            console.error("Error loading contacts:", err);
            setError(err instanceof Error ? err.message : "Failed to load contacts");
            setLoading(false);
        }
    }, [isModalOpen, account, read]);

    const toggleContactSelection = (contactId: string | undefined) => {
        if (!contactId) return;

        setSelectedContacts((prev) => {
            if (prev.includes(contactId)) {
                return prev.filter((id) => id !== contactId);
            } else {
                return [...prev, contactId];
            }
        });
    };

    const handleShare = () => {
        // This would actually share the content - for demo we'll just log and close
        console.log(
            `Sharing ${url} with:`,
            contacts.filter((c) => c._id && selectedContacts.includes(c._id))
        );
        setIsModalOpen(false);
        setSelectedContacts([]);
    };

    if (!account) return <div></div>;

    return (
        <>
            {/* Share Button */}
            <button
                onClick={() => setIsModalOpen(true)}
                className="fixed right-6 bottom-24 w-14 h-14 bg-indigo-500 hover:bg-indigo-600 rounded-full flex items-center justify-center shadow-lg transition-colors"
                aria-label="Share"
            >
                <IoMdShare className="text-white text-2xl" />
            </button>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white rounded-lg w-full max-w-md mx-4 overflow-hidden shadow-xl transform transition-all">
                        {/* Modal Header */}
                        <div className="px-4 py-3 border-b border-gray-200">
                            <h2 className="text-lg font-semibold">Share with Contacts</h2>
                            <p className="text-sm text-gray-500">Select contacts to share this page with</p>
                        </div>

                        {/* Error display */}
                        {error && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 m-4 rounded-lg" role="alert">
                                <span className="block sm:inline">{error}</span>
                            </div>
                        )}

                        {/* Contacts List */}
                        <div className="px-4 py-2 max-h-80 overflow-y-auto">
                            {loading ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
                                </div>
                            ) : contacts.length === 0 ? (
                                <div className="text-center py-10 text-gray-500">
                                    <p className="mb-4">No contacts found</p>
                                    <p className="text-sm">You need to create contacts first</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-gray-200">
                                    {contacts
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map((contact) => (
                                            <li
                                                key={contact._id}
                                                className="py-3 px-2 flex items-center hover:bg-gray-50 rounded-lg cursor-pointer"
                                                onClick={() => toggleContactSelection(contact._id)}
                                            >
                                                {/* Contact Avatar */}
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center mr-3 text-white font-medium text-sm relative"
                                                    style={{ backgroundColor: stringToColor(contact.name) }}
                                                >
                                                    {getInitials(contact.name)}

                                                    {/* Selection Indicator */}
                                                    {contact._id && selectedContacts.includes(contact._id) && (
                                                        <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
                                                            <FaCheck className="text-white text-xs" />
                                                        </div>
                                                    )}
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

                        {/* Modal Footer */}
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between">
                            <button
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 focus:outline-none"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    setSelectedContacts([]);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                className={`px-4 py-2 ${
                                    selectedContacts.length > 0 ? "bg-indigo-500 text-white hover:bg-indigo-600" : "bg-indigo-300 text-white cursor-not-allowed"
                                } rounded-lg focus:outline-none transition-colors`}
                                onClick={handleShare}
                                disabled={selectedContacts.length === 0}
                            >
                                Share ({selectedContacts.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
