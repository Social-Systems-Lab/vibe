// developers/reference/page.tsx - API Reference page
import { Metadata } from "next";
import { CodeTabs } from "@/components/CodeTabs";

export const metadata: Metadata = {
    title: "API Reference | Vibe Developer Documentation",
    description: "Complete reference documentation for Vibe SDK functions, options, and features.",
};

export default function ReferenceDocsPage() {
    return (
        <>
            <div className="mb-8">
                <div className="flex items-center mb-6">
                    <div className="h-8 w-1 bg-purple-600 mr-3"></div>
                    <h2 className="text-3xl font-bold text-gray-800">API Reference</h2>
                </div>

                <p className="text-gray-600 text-lg mb-4">
                    Complete reference documentation for Vibe SDK. This page covers all available functions, options, and features in both the React and JavaScript SDKs.
                </p>
            </div>

            <div>
                <section id="app-manifest" className="mb-12">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">App Manifest</h3>

                    <p className="text-gray-600 mb-4">The app manifest defines your application&apos;s identity and permissions. It&apos;s required when initializing the SDK.</p>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Interface</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "TypeScript",
                                    language: "typescript",
                                    code: `interface AppManifest {
    id: string;          // Unique identifier for your app
    name: string;        // Display name shown to users
    description: string; // Brief description of your app
    permissions: string[]; // Permissions your app requires (e.g., "read.contacts")
    pictureUrl?: string; // URL to your app's icon (optional)
    onetapEnabled?: boolean; // Enable one-tap login prompt (optional, default: false)
}`,
                                },
                            ]}
                        />
                    </div>

                    <h4 className="text-lg font-semibold text-gray-800 mb-3">Properties</h4>

                    <div className="overflow-x-auto mb-6">
                        <table className="w-full text-left">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-2 border">Property</th>
                                    <th className="px-4 py-2 border">Type</th>
                                    <th className="px-4 py-2 border">Required</th>
                                    <th className="px-4 py-2 border">Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="px-4 py-2 border font-mono text-sm">id</td>
                                    <td className="px-4 py-2 border font-mono text-sm">string</td>
                                    <td className="px-4 py-2 border">Yes</td>
                                    <td className="px-4 py-2 border">A unique identifier for your app. Use a consistent ID across all versions.</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2 border font-mono text-sm">name</td>
                                    <td className="px-4 py-2 border font-mono text-sm">string</td>
                                    <td className="px-4 py-2 border">Yes</td>
                                    <td className="px-4 py-2 border">The display name shown to users during authentication.</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2 border font-mono text-sm">description</td>
                                    <td className="px-4 py-2 border font-mono text-sm">string</td>
                                    <td className="px-4 py-2 border">Yes</td>
                                    <td className="px-4 py-2 border">A brief description of your app&apos;s purpose.</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2 border font-mono text-sm">permissions</td>
                                    <td className="px-4 py-2 border font-mono text-sm">string[]</td>
                                    <td className="px-4 py-2 border">Yes</td>
                                    <td className="px-4 py-2 border">Array of permission strings your app requires (e.g., &quot;read.contacts&quot;, &quot;write.contacts&quot;).</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2 border font-mono text-sm">pictureUrl</td>
                                    <td className="px-4 py-2 border font-mono text-sm">string</td>
                                    <td className="px-4 py-2 border">No</td>
                                    <td className="px-4 py-2 border">URL to your app&apos;s icon image. Displayed during authentication.</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-2 border font-mono text-sm">onetapEnabled</td>
                                    <td className="px-4 py-2 border font-mono text-sm">boolean</td>
                                    <td className="px-4 py-2 border">No</td>
                                    <td className="px-4 py-2 border">When true, enables streamlined one-tap login for returning users.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h4 className="text-lg font-semibold text-gray-800 mb-3">Example</h4>

                    <CodeTabs
                        tabs={[
                            {
                                label: "TypeScript",
                                language: "typescript",
                                code: `import { AppManifest } from "vibe-sdk";

// Define your app manifest
const manifest: AppManifest = {
    id: "my-contacts-app",
    name: "My Contacts App",
    description: "Manage your contacts securely with end-to-end encryption",
    permissions: [
        "read.contacts",
        "write.contacts"
    ],
    pictureUrl: "https://example.com/app-icon.png",
    onetapEnabled: true
};`,
                            },
                            {
                                label: "JavaScript",
                                language: "javascript",
                                code: `// Define your app manifest
const manifest = {
    id: "my-contacts-app",
    name: "My Contacts App",
    description: "Manage your contacts securely with end-to-end encryption",
    permissions: [
        "read.contacts",
        "write.contacts"
    ],
    pictureUrl: "https://example.com/app-icon.png",
    onetapEnabled: true
};`,
                            },
                        ]}
                    />
                </section>

                <section id="initialization" className="mb-12">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">Initialization</h3>

                    <p className="text-gray-600 mb-4">Initialize the SDK to establish connection with the Vibe ecosystem and begin using its features.</p>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">React SDK</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "API",
                                    language: "tsx",
                                    code: `// Component Props Interface
interface VibeProviderProps {
    manifest: AppManifest;      // Your app manifest
    autoInit?: boolean;         // Auto-initialize on mount (default: true)
    children: React.ReactNode;  // Child components
}

// Usage
<VibeProvider manifest={manifest} autoInit={true}>
    {/* Your app components */}
</VibeProvider>

// Hook API
const { 
    account,        // Current user account (null if not logged in)
    isLoading,      // True during initialization
    isInVibeApp,    // Whether running in Vibe environment
    permissions,    // Granted permissions
    read,           // Function for subscriptions
    readOnce,       // Function for one-time reads
    write           // Function for writing data
} = useVibe();`,
                                },
                                {
                                    label: "Example",
                                    language: "tsx",
                                    code: `import React from 'react';
import { VibeProvider, useVibe } from 'vibe-react';

// Your app manifest
const manifest = {
    id: "my-contacts-app",
    name: "My Contacts App",
    description: "Manage your contacts securely",
    permissions: ["read.contacts", "write.contacts"],
    pictureUrl: "https://example.com/app-icon.png"
};

// App component with VibeProvider
function App() {
    return (
        <VibeProvider manifest={manifest} autoInit={true}>
            <AppContent />
        </VibeProvider>
    );
}

// Child component using the useVibe hook
function AppContent() {
    const { account, isLoading } = useVibe();
    
    if (isLoading) {
        return <div>Loading...</div>;
    }
    
    return (
        <div>
            {account ? (
                <p>Welcome, {account.name}!</p>
            ) : (
                <p>Please log in to continue</p>
            )}
        </div>
    );
}`,
                                },
                            ]}
                        />
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">JavaScript SDK</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "API",
                                    language: "typescript",
                                    code: `// Initialization function
function init(
    manifest: AppManifest,
    callback?: (state: VibeState) => void
): Unsubscribe;

// VibeState interface
interface VibeState {
    account: Account | null;  // Current user account (null if not logged in)
    permissions: string[];    // Granted permissions
}

// Return type - function to unsubscribe from state updates
type Unsubscribe = () => void;`,
                                },
                                {
                                    label: "Example",
                                    language: "javascript",
                                    code: `import { vibe } from 'vibe-sdk';

// Your app manifest
const manifest = {
    id: "my-contacts-app",
    name: "My Contacts App",
    description: "Manage your contacts securely",
    permissions: ["read.contacts", "write.contacts"],
    pictureUrl: "https://example.com/app-icon.png"
};

// Initialize and subscribe to state changes
const unsubscribe = vibe.init(manifest, (state) => {
    if (state.account) {
        console.log("User logged in:", state.account.name);
        updateUIForLoggedInUser(state.account);
    } else {
        console.log("User not logged in");
        showLoginPrompt();
    }
});

// Later, when your app is closing or you no longer need the connection
function cleanup() {
    unsubscribe();
}`,
                                },
                            ]}
                        />
                    </div>
                </section>

                <section id="read-operations" className="mb-12">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">Read Operations</h3>

                    <p className="text-gray-600 mb-4">Vibe provides two ways to read data: subscriptions (real-time updates) and one-time reads.</p>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Subscriptions</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React API",
                                    language: "typescript",
                                    code: `// From useVibe() hook
function read(
    collection: string,
    filter?: Record<string, any>,
    callback?: (result: { docs: any[] }) => void
): Unsubscribe;`,
                                },
                                {
                                    label: "JavaScript API",
                                    language: "typescript",
                                    code: `// From vibe object
function read(
    collection: string,
    filter?: Record<string, any>,
    callback?: (result: { docs: any[] }) => void
): Unsubscribe;

// Return type - function to unsubscribe
type Unsubscribe = () => void;`,
                                },
                                {
                                    label: "React Example",
                                    language: "tsx",
                                    code: `import React, { useState, useEffect } from 'react';
import { useVibe } from 'vibe-react';

function ContactsList() {
    const [contacts, setContacts] = useState([]);
    const { account, read } = useVibe();
    
    useEffect(() => {
        if (!account) return;
        
        // Subscribe to the contacts collection
        const unsubscribe = read("contacts", {}, (result) => {
            setContacts(result.docs || []);
        });
        
        // Clean up subscription when component unmounts
        return () => unsubscribe();
    }, [account, read]);
    
    return (
        <div>
            <h2>Your Contacts</h2>
            <ul>
                {contacts.map(contact => (
                    <li key={contact.id}>{contact.name}</li>
                ))}
            </ul>
        </div>
    );
}`,
                                },
                                {
                                    label: "JavaScript Example",
                                    language: "javascript",
                                    code: `import { vibe } from 'vibe-sdk';

// Subscribe to the contacts collection
function subscribeToContacts() {
    const unsubscribe = vibe.read(
        "contacts",
        {},  // No filters
        (result) => {
            const contacts = result.docs || [];
            displayContacts(contacts);
        }
    );
    
    // Store unsubscribe function for later cleanup
    return unsubscribe;
}

// Start subscription when app initializes
const contactsUnsubscribe = subscribeToContacts();

// Clean up when done
function cleanup() {
    contactsUnsubscribe();
}`,
                                },
                            ]}
                        />
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">One-time Reads</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React API",
                                    language: "typescript",
                                    code: `// From useVibe() hook
function readOnce(
    collection: string,
    filter?: Record<string, any>
): Promise<{ docs: any[] }>;`,
                                },
                                {
                                    label: "JavaScript API",
                                    language: "typescript",
                                    code: `// From vibe object
function readOnce(
    collection: string,
    filter?: Record<string, any>
): Promise<{ docs: any[] }>;`,
                                },
                                {
                                    label: "React Example",
                                    language: "tsx",
                                    code: `import React, { useState } from 'react';
import { useVibe } from 'vibe-react';

function FetchContacts() {
    const [contacts, setContacts] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const { readOnce } = useVibe();
    
    async function handleFetchContacts() {
        setIsLoading(true);
        try {
            const result = await readOnce("contacts");
            setContacts(result.docs || []);
        } catch (error) {
            console.error("Error fetching contacts:", error);
        } finally {
            setIsLoading(false);
        }
    }
    
    return (
        <div>
            <button 
                onClick={handleFetchContacts}
                disabled={isLoading}
            >
                {isLoading ? "Loading..." : "Fetch Contacts"}
            </button>
            
            <ul>
                {contacts.map(contact => (
                    <li key={contact.id}>{contact.name}</li>
                ))}
            </ul>
        </div>
    );
}`,
                                },
                                {
                                    label: "JavaScript Example",
                                    language: "javascript",
                                    code: `import { vibe } from 'vibe-sdk';

// One-time read of contacts
async function fetchContacts() {
    try {
        const loadingIndicator = document.getElementById('loading');
        loadingIndicator.textContent = 'Loading...';
        
        const result = await vibe.readOnce("contacts");
        const contacts = result.docs || [];
        
        displayContacts(contacts);
        loadingIndicator.textContent = '';
    } catch (error) {
        console.error("Error fetching contacts:", error);
        const errorElement = document.getElementById('error');
        errorElement.textContent = 'Failed to load contacts.';
    }
}

// Add click event to a button
document.getElementById('fetch-button').addEventListener('click', fetchContacts);`,
                                },
                            ]}
                        />
                    </div>
                </section>

                <section id="write-operations" className="mb-12">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">Write Operations</h3>

                    <p className="text-gray-600 mb-4">Create or update data in a collection.</p>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">API</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React API",
                                    language: "typescript",
                                    code: `// From useVibe() hook
function write(
    collection: string,
    doc: Record<string, any>
): Promise<void>;`,
                                },
                                {
                                    label: "JavaScript API",
                                    language: "typescript",
                                    code: `// From vibe object
function write(
    collection: string,
    doc: Record<string, any>
): Promise<void>;`,
                                },
                            ]}
                        />
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Creating a New Document</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React Example",
                                    language: "tsx",
                                    code: `import React, { useState } from 'react';
import { useVibe } from 'vibe-react';

function AddContact() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { write } = useVibe();
    
    async function handleSubmit(e) {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            // Create a new contact document
            await write("contacts", {
                name,
                email
            });
            
            // Clear the form
            setName("");
            setEmail("");
            alert("Contact added successfully!");
        } catch (error) {
            console.error("Error adding contact:", error);
            alert("Failed to add contact.");
        } finally {
            setIsSubmitting(false);
        }
    }
    
    return (
        <form onSubmit={handleSubmit}>
            <h2>Add New Contact</h2>
            <div>
                <label>Name:</label>
                <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    required 
                />
            </div>
            <div>
                <label>Email:</label>
                <input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                />
            </div>
            <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding..." : "Add Contact"}
            </button>
        </form>
    );
}`,
                                },
                                {
                                    label: "JavaScript Example",
                                    language: "javascript",
                                    code: `import { vibe } from 'vibe-sdk';

// Set up form submission handler
document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitButton = document.getElementById('submit-button');
    submitButton.disabled = true;
    submitButton.textContent = 'Adding...';
    
    const name = document.getElementById('contact-name').value;
    const email = document.getElementById('contact-email').value;
    
    try {
        // Create a new contact document
        await vibe.write("contacts", {
            name,
            email
        });
        
        // Clear the form
        document.getElementById('contact-form').reset();
        alert("Contact added successfully!");
    } catch (error) {
        console.error("Error adding contact:", error);
        alert("Failed to add contact.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Add Contact';
    }
});`,
                                },
                            ]}
                        />
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Updating an Existing Document</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React Example",
                                    language: "tsx",
                                    code: `import React, { useState } from 'react';
import { useVibe } from 'vibe-react';

function UpdateContact({ contact }) {
    const [name, setName] = useState(contact.name);
    const [email, setEmail] = useState(contact.email);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { write } = useVibe();
    
    async function handleUpdate(e) {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            // Update the contact document
            // Note: Include the id to update an existing document
            await write("contacts", {
                id: contact.id,  // Required to update the specific document
                name,
                email
            });
            
            alert("Contact updated successfully!");
        } catch (error) {
            console.error("Error updating contact:", error);
            alert("Failed to update contact.");
        } finally {
            setIsSubmitting(false);
        }
    }
    
    return (
        <form onSubmit={handleUpdate}>
            <h2>Edit Contact</h2>
            <div>
                <label>Name:</label>
                <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    required 
                />
            </div>
            <div>
                <label>Email:</label>
                <input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                />
            </div>
            <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Updating..." : "Update Contact"}
            </button>
        </form>
    );
}`,
                                },
                                {
                                    label: "JavaScript Example",
                                    language: "javascript",
                                    code: `import { vibe } from 'vibe-sdk';

// Function to update a contact
async function updateContact(contactId, name, email) {
    const submitButton = document.getElementById('update-button');
    submitButton.disabled = true;
    submitButton.textContent = 'Updating...';
    
    try {
        // Update the contact document
        await vibe.write("contacts", {
            id: contactId,  // Required to update the specific document
            name,
            email
        });
        
        alert("Contact updated successfully!");
    } catch (error) {
        console.error("Error updating contact:", error);
        alert("Failed to update contact.");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Update Contact';
    }
}

// Set up the update form with current values
function setupUpdateForm(contact) {
    const nameInput = document.getElementById('update-name');
    const emailInput = document.getElementById('update-email');
    const updateForm = document.getElementById('update-form');
    
    nameInput.value = contact.name;
    emailInput.value = contact.email;
    
    // Handle form submission
    updateForm.onsubmit = (e) => {
        e.preventDefault();
        updateContact(contact.id, nameInput.value, emailInput.value);
    };
}`,
                                },
                            ]}
                        />
                    </div>
                </section>

                <section id="delete-operations" className="mb-12">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">Delete Operations</h3>

                    <p className="text-gray-600 mb-4">Delete documents from a collection.</p>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">API</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React API",
                                    language: "typescript",
                                    code: `// From useVibe() hook
function write(
    collection: string,
    doc: { id: string, _delete: true }
): Promise<void>;`,
                                },
                                {
                                    label: "JavaScript API",
                                    language: "typescript",
                                    code: `// From vibe object
function write(
    collection: string,
    doc: { id: string, _delete: true }
): Promise<void>;`,
                                },
                            ]}
                        />
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Example</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React Example",
                                    language: "tsx",
                                    code: `import React from 'react';
import { useVibe } from 'vibe-react';

function ContactItem({ contact }) {
    const { write } = useVibe();
    const [isDeleting, setIsDeleting] = useState(false);
    
    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this contact?")) {
            return;
        }
        
        setIsDeleting(true);
        
        try {
            // Delete the contact
            await write("contacts", {
                id: contact.id,
                _delete: true
            });
            
            // The UI will automatically update via the read subscription
        } catch (error) {
            console.error("Error deleting contact:", error);
            alert("Failed to delete contact.");
            setIsDeleting(false);
        }
    }
    
    return (
        <div className="contact-item">
            <h3>{contact.name}</h3>
            <p>{contact.email}</p>
            <button 
                onClick={handleDelete}
                disabled={isDeleting}
            >
                {isDeleting ? "Deleting..." : "Delete"}
            </button>
        </div>
    );
}`,
                                },
                                {
                                    label: "JavaScript Example",
                                    language: "javascript",
                                    code: `import { vibe } from 'vibe-sdk';

// Function to delete a contact
async function deleteContact(contactId) {
    if (!confirm("Are you sure you want to delete this contact?")) {
        return;
    }
    
    const deleteButton = document.getElementById(\`delete-\${contactId}\`);
    deleteButton.disabled = true;
    deleteButton.textContent = 'Deleting...';
    
    try {
        // Delete the contact
        await vibe.write("contacts", {
            id: contactId,
            _delete: true
        });
        
        // Remove from UI
        const contactElement = document.getElementById(\`contact-\${contactId}\`);
        if (contactElement) {
            contactElement.remove();
        }
    } catch (error) {
        console.error("Error deleting contact:", error);
        alert("Failed to delete contact.");
        deleteButton.disabled = false;
        deleteButton.textContent = 'Delete';
    }
}

// Setup delete buttons
function setupDeleteButtons() {
    document.querySelectorAll('.delete-button').forEach(button => {
        const contactId = button.dataset.contactId;
        button.addEventListener('click', () => deleteContact(contactId));
    });
}`,
                                },
                            ]}
                        />
                    </div>
                </section>

                <section id="filtering" className="mb-12">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">Filtering Data</h3>

                    <p className="text-gray-600 mb-4">Use filters to query specific data from collections based on field values.</p>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Basic Filtering</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React Example",
                                    language: "tsx",
                                    code: `import React, { useState, useEffect } from 'react';
import { useVibe } from 'vibe-react';

function FavoriteContacts() {
    const [favorites, setFavorites] = useState([]);
    const { account, read } = useVibe();
    
    useEffect(() => {
        if (!account) return;
        
        // Filter for favorite contacts only
        const unsubscribe = read(
            "contacts", 
            { isFavorite: true },
            (result) => {
                setFavorites(result.docs || []);
            }
        );
        
        return () => unsubscribe();
    }, [account, read]);
    
    return (
        <div>
            <h2>Favorite Contacts</h2>
            <ul>
                {favorites.map(contact => (
                    <li key={contact.id}>{contact.name} ⭐</li>
                ))}
            </ul>
        </div>
    );
}`,
                                },
                                {
                                    label: "JavaScript Example",
                                    language: "javascript",
                                    code: `import { vibe } from 'vibe-sdk';

// Subscribe to favorite contacts
function subscribeFavorites() {
    const unsubscribe = vibe.read(
        "contacts",
        { isFavorite: true },  // Filter for favorite contacts only
        (result) => {
            const favorites = result.docs || [];
            displayFavorites(favorites);
        }
    );
    
    return unsubscribe;
}

const favoritesUnsubscribe = subscribeFavorites();

// Clean up
function cleanup() {
    favoritesUnsubscribe();
}`,
                                },
                            ]}
                        />
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Advanced Filtering</h4>

                        <p className="text-gray-600 mb-4">You can combine multiple conditions in a filter object to create more complex queries.</p>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "Multiple Conditions",
                                    language: "typescript",
                                    code: `// Filter contacts that are both favorites and business contacts
const filter = { 
    isFavorite: true,
    category: "business"
};

// Use with read or readOnce
const unsubscribe = read("contacts", filter, (result) => {
    // Handle result
});`,
                                },
                                {
                                    label: "Array Contains",
                                    language: "typescript",
                                    code: `// Filter contacts that have a specific tag
const filter = {
    tags: "work"  // Will match if the tags array contains "work"
};

// Use with read or readOnce
const unsubscribe = read("contacts", filter, (result) => {
    // Handle result
});`,
                                },
                            ]}
                        />
                    </div>
                </section>

                <section id="environment" className="mb-12">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">Environment Detection</h3>

                    <p className="text-gray-600 mb-4">Check if your app is running within the Vibe environment to adapt features accordingly.</p>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">API</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React API",
                                    language: "typescript",
                                    code: `// From useVibe() hook
const { isInVibeApp } = useVibe();

// Returns boolean - true if running inside Vibe app environment`,
                                },
                                {
                                    label: "JavaScript API",
                                    language: "typescript",
                                    code: `// From vibe object
const isInVibeApp = vibe.isInVibeApp();

// Returns boolean - true if running inside Vibe app environment`,
                                },
                            ]}
                        />
                    </div>

                    <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">Example</h4>

                        <CodeTabs
                            tabs={[
                                {
                                    label: "React Example",
                                    language: "tsx",
                                    code: `import React from 'react';
import { useVibe } from 'vibe-react';

function EnvironmentBanner() {
    const { isInVibeApp } = useVibe();
    
    if (isInVibeApp) {
        return null; // No banner needed in Vibe app
    }
    
    return (
        <div className="banner">
            <p>
                Install the Vibe app for the full experience with secure authentication 
                and automatic data syncing.
            </p>
            <a href="https://getvibe.app" className="button">
                Get Vibe
            </a>
        </div>
    );
}`,
                                },
                                {
                                    label: "JavaScript Example",
                                    language: "javascript",
                                    code: `import { vibe } from 'vibe-sdk';

// Check environment and show appropriate UI
function checkEnvironment() {
    const isInVibeApp = vibe.isInVibeApp();
    const bannerElement = document.getElementById('install-banner');
    
    if (isInVibeApp) {
        // Hide the banner when in Vibe app
        if (bannerElement) {
            bannerElement.style.display = 'none';
        }
        
        // Enable full functionality
        enableFullFunctionality();
    } else {
        // Show the banner when not in Vibe app
        if (bannerElement) {
            bannerElement.style.display = 'block';
        }
        
        // Enable limited functionality or show alternative login
        enableLimitedFunctionality();
    }
}

// Call when page loads
checkEnvironment();`,
                                },
                            ]}
                        />
                    </div>
                </section>
            </div>
        </>
    );
}
