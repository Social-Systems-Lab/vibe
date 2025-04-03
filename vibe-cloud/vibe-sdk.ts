/**
 * Vibe SDK for Web Applications
 * 
 * This SDK provides a simple interface for web applications to interact with a vibe-cloud server.
 * It handles authentication, data access, and session management.
 */

export interface Account {
  did: string;
  username: string;
  domain: string;
}

export interface Session {
  did: string;
  username: string;
  domain: string;
  sessionToken: string;
  expires: number;
}

export interface AppManifest {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  pictureUrl?: string;
  onetapEnabled?: boolean;
}

export type Callback = (state: VibeState) => void;
export type Unsubscribe = () => void;

export interface VibeState {
  account?: Account;
  permissions: Record<string, "always" | "ask" | "never">;
}

/**
 * Vibe SDK for web applications
 */
export const vibe = (() => {
  let _state: VibeState = { permissions: {} };
  let _listeners: Callback[] = [];
  let _activeSession: Session | null = null;
  
  /**
   * Initialize the SDK with an app manifest
   * @param manifest Application manifest
   * @param callback Callback function to receive state updates
   * @returns Unsubscribe function
   */
  const init = (manifest: AppManifest, callback: Callback): Unsubscribe => {
    console.log(`🔵 Vibe SDK v2.0.0 🔵`);
    
    // Check for stored session
    getStoredSession().then(session => {
      if (session && !isSessionExpired(session)) {
        _activeSession = session;
        _state = { 
          ..._state, 
          account: {
            did: session.did,
            username: session.username,
            domain: session.domain
          }
        };
        
        // Notify listeners
        callback(_state);
      } else if (manifest.onetapEnabled) {
        // Show sign-in prompt if enabled
        showOneTapPrompt(manifest);
      }
    });
    
    _listeners.push(callback);
    return () => {
      _listeners = _listeners.filter(l => l !== callback);
    };
  };
  
  /**
   * Parse a handle into username and domain
   * @param handle User handle (username@domain or just username)
   * @returns Object with username and domain
   */
  const parseHandle = (handle: string): { username: string, domain: string } => {
    if (handle.includes('@')) {
      const [username, domain] = handle.split('@');
      return { username, domain };
    }
    
    // Default domain if not specified
    return { 
      username: handle, 
      domain: 'vibe.example.com' // Default domain
    };
  };
  
  /**
   * Authenticate with a vibe-cloud server
   * @param handle User handle (username@domain)
   * @param password User password
   * @returns Promise resolving to the authenticated account
   */
  const authenticate = async (handle: string, password: string): Promise<Account> => {
    const { username, domain } = parseHandle(handle);
    const vibeCloudUrl = `https://${domain}`;
    
    try {
      // 1. Request a challenge
      const challengeResponse = await fetch(`${vibeCloudUrl}/api/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      
      if (!challengeResponse.ok) {
        throw new Error(`Failed to get challenge: ${challengeResponse.statusText}`);
      }
      
      const { challenge } = await challengeResponse.json();
      
      // 2. Submit login with password and challenge
      const loginResponse = await fetch(`${vibeCloudUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          challenge
        })
      });
      
      if (!loginResponse.ok) {
        throw new Error(`Authentication failed: ${loginResponse.statusText}`);
      }
      
      const { did, signature, sessionToken } = await loginResponse.json();
      
      // 3. Create and store the session
      const session: Session = {
        did,
        username,
        domain,
        sessionToken,
        expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      };
      
      await storeSession(session);
      _activeSession = session;
      
      // 4. Update state and notify listeners
      _state = {
        ..._state,
        account: { did, username, domain }
      };
      
      _listeners.forEach(listener => listener(_state));
      
      return _state.account!;
    } catch (error) {
      console.error("Authentication error:", error);
      throw error;
    }
  };
  
  /**
   * Register a new account
   * @param handle User handle (username@domain)
   * @param password User password
   * @param inviteCode Invite code
   * @returns Promise resolving to the authenticated account
   */
  const register = async (handle: string, password: string, inviteCode: string): Promise<Account> => {
    const { username, domain } = parseHandle(handle);
    const vibeCloudUrl = `https://${domain}`;
    
    try {
      const response = await fetch(`${vibeCloudUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          inviteCode
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Registration failed: ${response.statusText}`);
      }
      
      const { did } = await response.json();
      
      // Automatically authenticate after registration
      return await authenticate(handle, password);
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  };
  
  /**
   * Read data from a collection
   * @param collection Collection name
   * @param filter Optional filter criteria
   * @returns Promise resolving to the data
   */
  const readOnce = async (collection: string, filter?: any): Promise<any> => {
    if (!_activeSession) {
      throw new Error("Not authenticated");
    }
    
    const vibeCloudUrl = `https://${_activeSession.domain}`;
    
    try {
      const response = await fetch(`${vibeCloudUrl}/api/data/${collection}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${_activeSession.sessionToken}`
        },
        body: JSON.stringify({ filter: filter || {} })
      });
      
      if (!response.ok) {
        throw new Error(`Data read failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Read error:", error);
      throw error;
    }
  };
  
  /**
   * Write data to a collection
   * @param collection Collection name
   * @param doc Document or array of documents to write
   * @returns Promise resolving to the result
   */
  const write = async (collection: string, doc: any): Promise<any> => {
    if (!_activeSession) {
      throw new Error("Not authenticated");
    }
    
    const vibeCloudUrl = `https://${_activeSession.domain}`;
    
    try {
      const response = await fetch(`${vibeCloudUrl}/api/data/${collection}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${_activeSession.sessionToken}`
        },
        body: JSON.stringify({ doc })
      });
      
      if (!response.ok) {
        throw new Error(`Data write failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Write error:", error);
      throw error;
    }
  };
  
  /**
   * Delete a document from a collection
   * @param collection Collection name
   * @param id Document ID
   * @returns Promise resolving to the result
   */
  const remove = async (collection: string, id: string): Promise<any> => {
    if (!_activeSession) {
      throw new Error("Not authenticated");
    }
    
    const vibeCloudUrl = `https://${_activeSession.domain}`;
    
    try {
      const response = await fetch(`${vibeCloudUrl}/api/data/${collection}/${id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${_activeSession.sessionToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Data delete failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Delete error:", error);
      throw error;
    }
  };
  
  /**
   * Log out the current user
   */
  const logout = async (): Promise<void> => {
    _activeSession = null;
    localStorage.removeItem('vibe:session');
    
    _state = {
      ..._state,
      account: undefined
    };
    
    _listeners.forEach(listener => listener(_state));
  };
  
  /**
   * Store session in browser storage
   * @param session Session object
   */
  const storeSession = async (session: Session): Promise<void> => {
    localStorage.setItem('vibe:session', JSON.stringify(session));
  };
  
  /**
   * Get stored session from browser storage
   * @returns Promise resolving to the session or null
   */
  const getStoredSession = async (): Promise<Session | null> => {
    const data = localStorage.getItem('vibe:session');
    return data ? JSON.parse(data) : null;
  };
  
  /**
   * Check if a session is expired
   * @param session Session object
   * @returns Boolean indicating if the session is expired
   */
  const isSessionExpired = (session: Session): boolean => {
    return Date.now() > session.expires;
  };
  
  /**
   * Show one-tap sign-in prompt
   * @param manifest App manifest
   */
  const showOneTapPrompt = (manifest: AppManifest): void => {
    // Create container for the prompt
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.top = "20px";
    container.style.right = "20px";
    container.style.backgroundColor = "#fff";
    container.style.boxShadow = "0px 4px 6px rgba(0, 0, 0, 0.1)";
    container.style.borderRadius = "8px";
    container.style.padding = "16px";
    container.style.zIndex = "1000";
    container.style.cursor = "pointer";
    container.style.transform = "scale(0.9)";
    container.style.transition = "transform 0.3s ease-out, opacity 0.3s ease-out";
    container.style.opacity = "0";

    // Flex layout for horizontal alignment
    container.style.display = "flex";
    container.style.alignItems = "center";
    container.style.justifyContent = "space-between";
    container.style.gap = "12px";

    // Animate in (fade-in and expand)
    requestAnimationFrame(() => {
      container.style.transform = "scale(1)";
      container.style.opacity = "1";
    });

    // Create app image (if available)
    if (manifest.pictureUrl) {
      const img = document.createElement("img");
      img.src = manifest.pictureUrl;
      img.style.width = "32px";
      img.style.height = "32px";
      img.style.borderRadius = "50%";
      container.appendChild(img);
    }

    // Add text
    const text = document.createElement("div");
    text.innerHTML = `
        <p>Sign in to ${manifest.name} with Vibe</p>
    `;
    text.style.flex = "1"; // Ensure text takes up remaining space
    text.style.fontSize = "14px";
    text.style.lineHeight = "1.5";
    container.appendChild(text);

    // Add close button
    const closeButton = document.createElement("span");
    closeButton.innerHTML = "&times;";
    closeButton.style.fontSize = "22px";
    closeButton.style.cursor = "pointer";
    closeButton.style.color = "#888";

    // Align close button to the right
    closeButton.onclick = () => {
      // Animate out (fade-out and shrink)
      container.style.transform = "scale(0.9)";
      container.style.opacity = "0";

      setTimeout(() => {
        container.remove();
      }, 300);
    };

    container.appendChild(closeButton);

    container.onclick = (e) => {
      if (e.target === closeButton) return;

      // Show sign-in form
      showSignInForm(manifest);

      // Close the prompt after interaction
      if (closeButton.onclick) {
        closeButton.onclick(e as MouseEvent);
      }
    };

    // Add to body
    document.body.appendChild(container);
  };
  
  /**
   * Show sign-in form
   * @param manifest App manifest
   */
  const showSignInForm = (manifest: AppManifest): void => {
    // Create modal container
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    modal.style.display = "flex";
    modal.style.justifyContent = "center";
    modal.style.alignItems = "center";
    modal.style.zIndex = "1001";
    
    // Create form container
    const formContainer = document.createElement("div");
    formContainer.style.backgroundColor = "#fff";
    formContainer.style.borderRadius = "8px";
    formContainer.style.padding = "24px";
    formContainer.style.width = "400px";
    formContainer.style.maxWidth = "90%";
    
    // Create form header
    const header = document.createElement("h2");
    header.textContent = `Sign in to ${manifest.name}`;
    header.style.margin = "0 0 16px 0";
    header.style.fontSize = "20px";
    formContainer.appendChild(header);
    
    // Create form
    const form = document.createElement("form");
    form.onsubmit = (e) => {
      e.preventDefault();
      
      const handleInput = form.querySelector("#vibe-handle") as HTMLInputElement;
      const passwordInput = form.querySelector("#vibe-password") as HTMLInputElement;
      
      if (handleInput && passwordInput) {
        authenticate(handleInput.value, passwordInput.value)
          .then(() => {
            modal.remove();
          })
          .catch(error => {
            const errorElement = form.querySelector("#vibe-error");
            if (errorElement) {
              errorElement.textContent = error.message;
            }
          });
      }
    };
    
    // Create handle input
    const handleLabel = document.createElement("label");
    handleLabel.textContent = "Username or Handle";
    handleLabel.style.display = "block";
    handleLabel.style.marginBottom = "4px";
    handleLabel.style.fontSize = "14px";
    form.appendChild(handleLabel);
    
    const handleInput = document.createElement("input");
    handleInput.type = "text";
    handleInput.id = "vibe-handle";
    handleInput.placeholder = "username@domain";
    handleInput.style.width = "100%";
    handleInput.style.padding = "8px";
    handleInput.style.marginBottom = "16px";
    handleInput.style.borderRadius = "4px";
    handleInput.style.border = "1px solid #ccc";
    form.appendChild(handleInput);
    
    // Create password input
    const passwordLabel = document.createElement("label");
    passwordLabel.textContent = "Password";
    passwordLabel.style.display = "block";
    passwordLabel.style.marginBottom = "4px";
    passwordLabel.style.fontSize = "14px";
    form.appendChild(passwordLabel);
    
    const passwordInput = document.createElement("input");
    passwordInput.type = "password";
    passwordInput.id = "vibe-password";
    passwordInput.placeholder = "Password";
    passwordInput.style.width = "100%";
    passwordInput.style.padding = "8px";
    passwordInput.style.marginBottom = "16px";
    passwordInput.style.borderRadius = "4px";
    passwordInput.style.border = "1px solid #ccc";
    form.appendChild(passwordInput);
    
    // Create error message element
    const errorElement = document.createElement("div");
    errorElement.id = "vibe-error";
    errorElement.style.color = "red";
    errorElement.style.fontSize = "14px";
    errorElement.style.marginBottom = "16px";
    form.appendChild(errorElement);
    
    // Create submit button
    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.textContent = "Sign In";
    submitButton.style.backgroundColor = "#007bff";
    submitButton.style.color = "#fff";
    submitButton.style.border = "none";
    submitButton.style.borderRadius = "4px";
    submitButton.style.padding = "8px 16px";
    submitButton.style.cursor = "pointer";
    form.appendChild(submitButton);
    
    formContainer.appendChild(form);
    modal.appendChild(formContainer);
    
    // Close modal when clicking outside
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    };
    
    document.body.appendChild(modal);
  };
  
  return {
    init,
    authenticate,
    register,
    readOnce,
    write,
    remove,
    logout,
    parseHandle
  };
})();

// Make vibe available globally
if (typeof window !== "undefined") {
  (window as any).vibe = vibe;
}
