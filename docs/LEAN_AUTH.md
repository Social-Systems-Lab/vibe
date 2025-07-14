# Lean Authentication Protocol

## Guiding Principles

1.  **Simplicity First:** We will implement the absolute minimum required to achieve our goals. We will favor simple, direct code over complex abstractions or rigid adherence to protocols for their own sake.
2.  **Just-In-Time Implementation:** Features will be added only when they are strictly necessary to unblock the next step in our development.
3.  **Control and Transparency:** We will own the entire authentication flow, ensuring we have full control and understanding of the system. There will be no "black boxes".
4.  **Future-Proofing:** The architecture must be flexible enough to support future requirements like federation without a radical redesign.

## Core Goals

### End-user experience

The user visits a third party app that integrates with Vibe. Here are three different user scenarios.

1. Fresh browser, incognito, user is signed out of Vibe or have no account. (No vibe session active)

-   User sees two buttons "Log in" and "Sign up" in the top-right corner.
-   Clicking on the sign up button opens a window with the Vibe sign up form.
-   The user fills out the form, clicks sign up, and is returned to the website logged in.

2. User has an active vibe session but third party app hasn't been authorized by user

-   One-tap chip appears "Continue as <Name>" (text can be tweaked)
-   User clicks the chip a popup open with a consent page.
-   User reviews it and clicks Allow, and is returned to the website logged in.

3. User has an active vibe session and app has been authorized

-   User is silently signed in with no interaction needed if browser sign-in heuristic allows, otherwise a one-tap chip appears and clicking on it signs the user in.

When signed in on the website they see, instead of log in and sign up button, a vibe toolbar with icons for notifications, messagess, and user profile menu (user avatar shown). As a first step it should simply show the user DID and a log out button.

### Third-party app developer

-   Origin-only mode is easy set up - drop a .well-known/vibe-app.json and you're registered, client_id is the origin
-   SDK one-liner - <VibeProvider oneTap> gives sign-in, one-tap chip, silent refresh.
-   Zero backend needed - Token exchange, RT rotation, and token storage all happens out of the box.
-   If you want portable identity the client_id is ownerDid + appId, e.g. did:vibe:1234#chat

### Self-hosted Vibe Cloud & Federation (long-term vision)

-   Users/organization can run their own Vibe Cloud instance for sovereignty reasons. Our official vibe cloud can help with routing to the right place.
-   Critically, the ecosystem works even if the official vibe cloud is offline, but routing may have to be done manually unless there is a robust censorship proof mechanism that can be utilized. The manual routing is done through the user manually entering URLs as a fallback.

This functionality does not need to be in place for the MVP but we need to keep it in mind and not build the auth system in a way that is an obstacle to this from being implemented in the future.
