# Vibe SDK for React Developers

## Overview

Vibe lets developers build powerful web applications with authentication, secure storage, and real-time data synchronization – all without writing backend code. Our SDKs are available for both React and vanilla JavaScript projects.

### For Developers

✓ Authenticate users with just a few lines of code
✓ Built-in storage and real-time data syncing
✓ No backend or server infrastructure needed
✓ Simple APIs for cross-app data sharing

### For Users

✓ Complete ownership and control of personal data
✓ Privacy by default - no third-party tracking
✓ Seamless multi-app experience with universal login
✓ Full transparency on data access and usage

---

## Get Started

### Installation

Choose the package that best fits your project - `vibe-react` for React applications or `vibe-sdk` for vanilla JavaScript projects.

```bash
npm install vibe-react
```

### Initializing the SDK

To get started with Vibe, you need to wrap your application in the `VibeProvider`. This provider initializes the SDK and makes it available to all child components. It requires a `config` object that defines your app's identity and how it connects to the Vibe network.

Here is a typical setup in your main `App` or `Layout` component:

```jsx
import React from 'react';
import { VibeProvider } from 'vibe-react';

// Vibe SDK Configuration
const config = {
    appName: "My Awesome App",
    appImageUrl: "https://example.com/app-icon.png", // Optional
    apiUrl: "http://localhost:5000", // Your Vibe backend endpoint
    clientId: "http://localhost:3000", // Your app's origin
    redirectUri: "http://localhost:3000/auth/callback", // Vibe callback URL
    useHub: true, // Recommended for most web apps
};

function App() {
    return (
        &lt;VibeProvider config={config}&gt;
            {/* Your app components go here */}
            &lt;YourAppComponent /&gt;
        &lt;/VibeProvider&gt;
    );
}

export default App;
```

**Configuration Options:**

-   `appName`: The name of your application.
-   `appImageUrl`: A URL to an icon for your application.
-   `apiUrl`: The endpoint for the Vibe backend services.
-   `clientId`: The origin URL of your application.
-   `redirectUri`: The full URL where users are redirected after authentication. This must be registered in your Vibe application settings.
-   `useHub`: A boolean to enable the Vibe Hub, which facilitates cross-app communication and authentication.

---

## Authentication

Vibe provides a simple yet powerful way to manage user authentication. The `useVibe` hook is the primary way to interact with the authentication state and trigger authentication flows.

### The `useVibe` Hook

Once your app is wrapped in `VibeProvider`, you can access the Vibe context in any component using the `useVibe` hook.

```jsx
import { useVibe } from 'vibe-react';

function MyComponent() {
    const { user, isLoggedIn, login, logout, signup } = useVibe();

    if (!isLoggedIn) {
        return (
            &lt;div&gt;
                &lt;button onClick={() => login()}&gt;Log In&lt;/button&gt;
                &lt;button onClick={() => signup()}&gt;Sign Up&lt;/button&gt;
            &lt;/div&gt;
        );
    }

    return (
        &lt;div&gt;
            &lt;p&gt;Welcome, {user?.displayName || 'friend'}!&lt;/p&gt;
            &lt;button onClick={() => logout()}&gt;Log Out&lt;/button&gt;
        &lt;/div&gt;
    );
}
```

### Auth State

The `useVibe` hook provides two important state variables:

-   `isLoggedIn` (boolean): Indicates whether the user is currently authenticated.
-   `user` (object | null): Contains information about the logged-in user, such as their `did` (Decentralized Identifier) and `displayName`.

### Auth Methods

-   `login()`: Initiates the login flow.
-   `logout()`: Logs the current user out.
-   `signup()`: Initiates the registration flow for new users.

### UI Components

For a quicker setup, `vibe-react` also includes pre-built UI components:

-   `AuthWidget`: A complete widget that shows login/signup buttons or the user's profile if they are logged in.
-   `LoginButton`: A simple button that triggers the `login()` flow.
-   `SignupButton`: A simple button that triggers the `signup()` flow.
-   `ProfileMenu`: A dropdown menu for logged-in users, typically showing profile information and a logout button.

**Example using `AuthWidget`:**

```jsx
import { AuthWidget } from 'vibe-react';

function Header() {
    return (
        &lt;header&gt;
            &lt;nav&gt;
                {/* ... other nav items ... */}
                &lt;AuthWidget /&gt;
            &lt;/nav&gt;
        &lt;/header&gt;
    );
}
```

---

## Reading Data

Vibe offers two primary methods for reading data: real-time subscriptions with `read()` and one-time fetches with `readOnce()`.

### Real-time Subscriptions with `read()`

For data that needs to be kept in sync in real-time, you can subscribe to a collection. The `read()` method takes a collection name, an optional query object, and a callback function that will be invoked whenever the data changes.

The method returns a promise that resolves to a `subscription` object, which you should use to `unsubscribe` when the component unmounts to prevent memory leaks.

```jsx
import React, { useState, useEffect } from 'react';
import { useVibe } from 'vibe-react';

function ContactsList() {
    const [contacts, setContacts] = useState([]);
    const { isLoggedIn, read } = useVibe();

    useEffect(() => {
        if (!isLoggedIn) return;

        // Define the callback to process incoming data
        const handleData = (result) => {
            if (result.ok && result.data) {
                setContacts(result.data);
            } else {
                console.error("Error reading contacts:", result.error);
            }
        };

        // Subscribe to the 'contacts' collection
        const subscriptionPromise = read("contacts", {}, handleData);

        let subscription;
        subscriptionPromise.then(sub => {
            subscription = sub;
        });

        // Clean up the subscription on component unmount
        return () => {
            if (subscription) {
                subscription.unsubscribe();
            }
        };
    }, [isLoggedIn, read]);

    return (
        &lt;div&gt;
            &lt;h2&gt;Your Contacts&lt;/h2&gt;
            &lt;ul&gt;
                {contacts.map(contact => (
                    &lt;li key={contact._id}&gt;{contact.name}&lt;/li&gt;
                ))}
            &lt;/ul&gt;
        &lt;/div&gt;
    );
}
```

### Reading Data Once with `readOnce()`

If you only need to fetch data a single time without subscribing to updates, you can use the `readOnce()` method. It returns a promise that resolves with the query result.

```jsx
import React, { useState } from 'react';
import { useVibe } from 'vibe-react';

function UserProfile({ userId }) {
    const [profile, setProfile] = useState(null);
    const { readOnce } = useVibe();

    const fetchProfile = async () => {
        try {
            // Fetch a single document by its ID
            const result = await readOnce("profiles", { _id: userId });
            if (result.ok && result.data) {
                setProfile(result.data[0]); // readOnce returns an array
            }
        } catch (error) {
            console.error("Failed to fetch profile:", error);
        }
    };

    return (
        &lt;div&gt;
            &lt;button onClick={fetchProfile}&gt;Load Profile&lt;/button&gt;
            {profile && &lt;p&gt;{profile.name}&lt;/p&gt;}
        &lt;/div&gt;
    );
}
```

---

## Writing Data

To create or update data in Vibe's secure storage, use the `write()` method from the `useVibe` hook.

The `write()` method takes the collection name and the data object you want to save. If the object has an `_id` property, Vibe will attempt to update the existing document; otherwise, it will create a new one.

```jsx
import React, { useState } from 'react';
import { useVibe } from 'vibe-react';

function AddContactForm() {
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
            alert("Failed to add contact.");
        }
    }

    return (
        &lt;form onSubmit={handleSubmit}&gt;
            &lt;h2&gt;Add New Contact&lt;/h2&gt;
            &lt;div&gt;
                &lt;label&gt;Name:&lt;/label&gt;
                &lt;input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                /&gt;
            &lt;/div&gt;
            &lt;div&gt;
                &lt;label&gt;Email:&lt;/label&gt;
                &lt;input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                /&gt;
            &lt;/div&gt;
            &lt;button type="submit"&gt;Add Contact&lt;/button&gt;
        &lt;/form&gt;
    );
}
```

---

## Querying Data

Both `read()` and `readOnce()` methods accept a query object to filter, sort, and shape the data you receive.

### Filtering

To filter data, you can include properties in the query object that match the fields in your documents. For example, to find all contacts from a specific city, you would do:

```jsx
// Find all contacts in 'San Francisco'
read("contacts", { city: "San Francisco" }, handleData);
```

### Sorting

You can sort the results using the `sort` parameter. The value is an object where keys are the fields to sort by and values are `1` for ascending order or `-1` for descending order.

```jsx
// Get posts, sorted by creation date descending
const query = {
    sort: { createdAt: -1 },
};
read("posts", query, handleData);
```

### Limiting Results

Use the `limit` parameter to restrict the number of documents returned.

```jsx
// Get the 10 most recent posts
const query = {
    sort: { createdAt: -1 },
    limit: 10,
};
read("posts", query, handleData);
```

### Expanding Relations

If your data contains references to other documents (e.g., a post has an `author` field that is a reference to a document in the `profiles` collection), you can use the `expand` parameter to automatically fetch the related data.

```jsx
// In this example, the 'author' field in a 'post' document looks like:
// { did: "did:key:z...", ref: "profiles/some-profile-id" }

// Fetch posts and automatically include the full author profile
const query = {
    expand: ["author"], // or "author" for a single field
};
read("posts", query, (result) => {
    if (result.ok) {
        // Each post will now have an 'author' object with the full profile
        // e.g., post.author.name, post.author.pictureUrl
        setPosts(result.data);
    }
});
```

---

## Deleting Data

To remove a document from a collection, use the `remove()` method. You need to provide the collection name and an object specifying the `_id` of the document to be deleted.

```jsx
import { useVibe } from 'vibe-react';

function ContactItem({ contact }) {
    const { remove } = useVibe();

    const handleDelete = async () => {
        if (window.confirm("Are you sure you want to delete this contact?")) {
            try {
                await remove("contacts", { _id: contact._id });
                alert("Contact deleted.");
            } catch (error) {
                console.error("Failed to delete contact:", error);
                alert("Error deleting contact.");
            }
        }
    };

    return (
        &lt;li&gt;
            {contact.name}
            &lt;button onClick={handleDelete}&gt;Delete&lt;/button&gt;
        &lt;/li&gt;
    );
}
```

---

## API Reference: `useVibe()`

The `useVibe` hook provides access to the Vibe SDK's core functionality.

| Property          | Type                                                       | Description                                                                                           |
| ----------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `user`            | `User \| null`                                             | An object containing the current user's data (`did`, `displayName`, etc.) or `null` if not logged in. |
| `isLoggedIn`      | `boolean`                                                  | `true` if the user is authenticated, otherwise `false`.                                               |
| `login()`         | `() => Promise<void>`                                      | Initiates the user login flow.                                                                        |
| `logout()`        | `() => Promise<void>`                                      | Logs the current user out.                                                                            |
| `signup()`        | `() => Promise<void>`                                      | Initiates the user signup flow.                                                                       |
| `manageConsent()` | `() => Promise<void>`                                      | Opens the consent management view for the user.                                                       |
| `manageProfile()` | `() => Promise<void>`                                      | Opens the profile management view for the user.                                                       |
| `read()`          | `(collection, [query], callback) => Promise<Subscription>` | Subscribes to real-time updates for a collection.                                                     |
| `readOnce()`      | `(collection, [query]) => Promise<ReadResult>`             | Fetches data from a collection a single time.                                                         |
| `write()`         | `(collection, data) => Promise<any>`                       | Creates or updates a document in a collection.                                                        |
| `remove()`        | `(collection, {_id}) => Promise<any>`                      | Deletes a document from a collection.                                                                 |
| `sdk`             | `VibeSDK`                                                  | The raw Vibe SDK instance for advanced use cases.                                                     |
| `appName`         | `string`                                                   | The name of the application, as defined in the `VibeProvider` config.                                 |
| `appImageUrl`     | `string`                                                   | The image URL for the application, as defined in the `VibeProvider` config.                           |

---

## Next Steps

Now that you've learned the basics, you're ready to start building with Vibe. Explore the official GitHub repository for more examples and to dive deeper into the source code.
