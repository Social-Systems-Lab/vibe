// developers/page.tsx - Getting Started page
import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { Metadata } from "next";
import { CodeTabs } from "@/components/CodeTabs";

export const metadata: Metadata = {
    title: "Getting Started with Vibe | Developer Documentation",
    description: "Start building with Vibe SDK - Installation, initialization, and basic data operations guide.",
};

export default function DevelopersPage() {
    return (
        <>
            <div className="mb-12">
                <div className="flex items-center mb-6">
                    <div className="h-8 w-1 bg-purple-600 mr-3"></div>
                    <h2 className="text-3xl font-bold text-gray-800">Overview</h2>
                </div>
                
                <p className="text-gray-600 text-lg mb-6">
                    Vibe lets developers build powerful web applications with authentication, secure storage, and real-time 
                    data synchronization – all without writing backend code. Our SDKs are available for both React and vanilla 
                    JavaScript projects.
                </p>
                
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-purple-50 p-5 rounded-lg border border-purple-100">
                        <h3 className="text-xl font-semibold text-purple-800 mb-3">For Developers</h3>
                        <ul className="space-y-2">
                            <li className="flex">
                                <span className="text-purple-600 mr-2">✓</span>
                                <span>Authenticate users with just a few lines of code</span>
                            </li>
                            <li className="flex">
                                <span className="text-purple-600 mr-2">✓</span>
                                <span>Built-in storage and real-time data syncing</span>
                            </li>
                            <li className="flex">
                                <span className="text-purple-600 mr-2">✓</span>
                                <span>No backend or server infrastructure needed</span>
                            </li>
                            <li className="flex">
                                <span className="text-purple-600 mr-2">✓</span>
                                <span>Simple APIs for cross-app data sharing</span>
                            </li>
                        </ul>
                    </div>
                    
                    <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                        <h3 className="text-xl font-semibold text-blue-800 mb-3">For Users</h3>
                        <ul className="space-y-2">
                            <li className="flex">
                                <span className="text-blue-600 mr-2">✓</span>
                                <span>Complete ownership and control of personal data</span>
                            </li>
                            <li className="flex">
                                <span className="text-blue-600 mr-2">✓</span>
                                <span>Privacy by default - no third-party tracking</span>
                            </li>
                            <li className="flex">
                                <span className="text-blue-600 mr-2">✓</span>
                                <span>Seamless multi-app experience with universal login</span>
                            </li>
                            <li className="flex">
                                <span className="text-blue-600 mr-2">✓</span>
                                <span>Full transparency on data access and usage</span>
                            </li>
                        </ul>
                    </div>
                </div>
                
                <div className="flex space-x-4 mb-6">
                    <a 
                        href="https://github.com/Social-Systems-Lab/vibe"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center bg-purple-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-opacity-90 transition duration-300"
                    >
                        <Github className="mr-2 h-5 w-5" />
                        GitHub Repository
                    </a>
                    <a 
                        href="#installation"
                        className="inline-flex items-center bg-gray-200 text-gray-800 px-4 py-2 rounded-md font-semibold hover:bg-gray-300 transition duration-300"
                    >
                        Get Started
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </a>
                </div>
            </div>

            <section id="installation" className="mb-12">
                <div className="flex items-center mb-6">
                    <div className="h-8 w-1 bg-purple-600 mr-3"></div>
                    <h2 className="text-3xl font-bold text-gray-800">Installation</h2>
                </div>
                
                <p className="text-gray-600 mb-6">
                    Choose the package that best fits your project - <code className="bg-gray-100 px-1 py-0.5 rounded text-purple-600">vibe-react</code> for React applications 
                    or <code className="bg-gray-100 px-1 py-0.5 rounded text-purple-600">vibe-sdk</code> for vanilla JavaScript projects.
                </p>
                
                <CodeTabs
                    tabs={[
                        {
                            label: "React",
                            language: "bash",
                            code: `npm install vibe-react`
                        },
                        {
                            label: "JavaScript",
                            language: "bash",
                            code: `npm install vibe-sdk`
                        }
                    ]}
                />
            </section>

            <section id="initialization" className="mb-12">
                <div className="flex items-center mb-6">
                    <div className="h-8 w-1 bg-purple-600 mr-3"></div>
                    <h2 className="text-3xl font-bold text-gray-800">Initializing the SDK</h2>
                </div>
                
                <p className="text-gray-600 mb-4">
                    First, create an app manifest that defines your app's identity and requested permissions, then initialize the SDK.
                </p>
                
                <CodeTabs
                    tabs={[
                        {
                            label: "React",
                            language: "tsx",
                            code: `import React from 'react';
import { VibeProvider } from 'vibe-react';

// App manifest defines your app identity and permissions
const manifest = {
    id: "my-contacts-app",
    name: "My Contacts App",
    description: "Manage your contacts securely",
    permissions: ["read.contacts", "write.contacts"],
    pictureUrl: "https://example.com/app-icon.png"
};

function App() {
    return (
        <VibeProvider manifest={manifest} autoInit={true}>
            {/* Your app components */}
            <YourAppComponent />
        </VibeProvider>
    );
}

export default App;`
                        },
                        {
                            label: "JavaScript",
                            language: "javascript",
                            code: `import { vibe } from 'vibe-sdk';

// App manifest defines your app identity and permissions
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
        console.log("User is logged in:", state.account.name);
    } else {
        console.log("User is not logged in");
    }
});`
                        }
                    ]}
                />
                
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 my-6">
                    <p className="text-blue-700">
                        <strong>Note:</strong> For more details about the app manifest options, see the <Link href="/developers/reference" className="text-blue-600 hover:underline">API Reference</Link>.
                    </p>
                </div>
            </section>

            <section id="reading-data" className="mb-12">
                <div className="flex items-center mb-6">
                    <div className="h-8 w-1 bg-purple-600 mr-3"></div>
                    <h2 className="text-3xl font-bold text-gray-800">Reading Data</h2>
                </div>
                
                <p className="text-gray-600 mb-4">
                    With Vibe, you can subscribe to collections and get real-time updates when data changes.
                </p>
                
                <CodeTabs
                    tabs={[
                        {
                            label: "React",
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
}`
                        },
                        {
                            label: "JavaScript",
                            language: "javascript",
                            code: `import { vibe } from 'vibe-sdk';

// Subscribe to the contacts collection
function subscribeToContacts() {
    const unsubscribe = vibe.read(
        "contacts",
        {},  // No filters - get all contacts
        (result) => {
            const contacts = result.docs || [];
            displayContacts(contacts);
        }
    );
    
    // Store unsubscribe function for later cleanup
    window.contactsUnsubscribe = unsubscribe;
}

// Display contacts in the UI
function displayContacts(contacts) {
    const contactsList = document.getElementById('contacts-list');
    contactsList.innerHTML = '';
    
    contacts.forEach(contact => {
        const li = document.createElement('li');
        li.textContent = contact.name;
        contactsList.appendChild(li);
    });
}

// Call this when your app loads
subscribeToContacts();`
                        }
                    ]}
                />
            </section>
            
            <section id="writing-data" className="mb-12">
                <div className="flex items-center mb-6">
                    <div className="h-8 w-1 bg-purple-600 mr-3"></div>
                    <h2 className="text-3xl font-bold text-gray-800">Writing Data</h2>
                </div>
                
                <p className="text-gray-600 mb-4">
                    Create or update data in Vibe's secure storage system.
                </p>
                
                <CodeTabs
                    tabs={[
                        {
                            label: "React",
                            language: "tsx",
                            code: `import React, { useState } from 'react';
import { useVibe } from 'vibe-react';

function AddContact() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const { write } = useVibe();
    
    async function handleSubmit(e) {
        e.preventDefault();
        
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
            <button type="submit">Add Contact</button>
        </form>
    );
}`
                        },
                        {
                            label: "JavaScript",
                            language: "javascript",
                            code: `import { vibe } from 'vibe-sdk';

// Set up form submission handler
document.getElementById('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
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
    }
});`
                        }
                    ]}
                />
            </section>

            <section id="next-steps" className="mb-12">
                <div className="flex items-center mb-6">
                    <div className="h-8 w-1 bg-purple-600 mr-3"></div>
                    <h2 className="text-3xl font-bold text-gray-800">Next Steps</h2>
                </div>
                
                <p className="text-gray-600 mb-6">
                    Now that you've learned the basics, explore more advanced features and detailed documentation:
                </p>
                
                <div className="grid md:grid-cols-2 gap-6">
                    <Link 
                        href="/developers/reference" 
                        className="block p-5 bg-white border border-gray-200 rounded-lg hover:shadow-md transition duration-300"
                    >
                        <h3 className="text-xl font-semibold text-gray-800 mb-2">API Reference</h3>
                        <p className="text-gray-600 mb-2">Complete reference for all Vibe SDK functions and features.</p>
                        <span className="text-purple-600 flex items-center">
                            Learn more
                            <ArrowRight className="ml-1 h-4 w-4" />
                        </span>
                    </Link>
                    
                    <Link 
                        href="/developers/contribute" 
                        className="block p-5 bg-white border border-gray-200 rounded-lg hover:shadow-md transition duration-300"
                    >
                        <h3 className="text-xl font-semibold text-gray-800 mb-2">Contribute</h3>
                        <p className="text-gray-600 mb-2">Join the community and help build the future of Vibe.</p>
                        <span className="text-purple-600 flex items-center">
                            Get involved
                            <ArrowRight className="ml-1 h-4 w-4" />
                        </span>
                    </Link>
                </div>
            </section>
        </>
    );
}
