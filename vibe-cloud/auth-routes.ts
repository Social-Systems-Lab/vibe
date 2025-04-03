import { Router, Context } from "oak";
import { v4 as uuidv4 } from "uuid";
import * as bcrypt from "bcrypt";
import { 
  generateRSAKeypair, 
  signData, 
  generateDID,
  encryptWithPassword,
  decryptWithPassword
} from "./crypto-utils.ts";

// In-memory challenge store (would be replaced with Redis or similar in production)
const challengeStore = new Map<string, { challenge: string, timestamp: number }>();

export function createAuthRouter(db: any) {
  const router = new Router();
  
  // Challenge endpoint
  router.post("/api/auth/challenge", async (ctx: Context) => {
    try {
      const body = await ctx.request.body().value;
      const { username } = body;
      
      if (!username) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Username is required" };
        return;
      }
      
      // Generate a random challenge
      const challenge = uuidv4();
      
      // Store the challenge with a timestamp (for expiration)
      challengeStore.set(username, {
        challenge,
        timestamp: Date.now()
      });
      
      ctx.response.body = { challenge };
    } catch (error) {
      console.error("Challenge error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  });
  
  // Login endpoint
  router.post("/api/auth/login", async (ctx: Context) => {
    try {
      const body = await ctx.request.body().value;
      const { username, password, challenge } = body;
      
      if (!username || !password || !challenge) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Username, password, and challenge are required" };
        return;
      }
      
      // Verify the challenge is valid and not expired
      const storedChallenge = challengeStore.get(username);
      if (!storedChallenge || 
          storedChallenge.challenge !== challenge || 
          Date.now() - storedChallenge.timestamp > 5 * 60 * 1000) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Invalid or expired challenge" };
        return;
      }
      
      // Find the user account
      const result = await db.find({
        selector: { 
          type: "account",
          username: username 
        },
        limit: 1
      });
      
      if (result.docs.length === 0) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Invalid credentials" };
        return;
      }
      
      const account = result.docs[0];
      
      // Verify password
      const passwordValid = await bcrypt.compare(password, account.passwordHash);
      if (!passwordValid) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Invalid credentials" };
        return;
      }
      
      // Decrypt the private key using the password
      const privateKey = await decryptWithPassword(account.encryptedPrivateKey, password);
      
      // Sign the challenge with the private key
      const signature = await signData(privateKey, challenge);
      
      // Generate a session token (JWT)
      const sessionToken = await generateSessionToken(account.did, account.username);
      
      // Clear the used challenge
      challengeStore.delete(username);
      
      // Return the signed response and session token
      ctx.response.body = {
        did: account.did,
        username: account.username,
        signature,
        sessionToken
      };
    } catch (error) {
      console.error("Login error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  });
  
  // Account creation endpoint (invite-based)
  router.post("/api/auth/register", async (ctx: Context) => {
    try {
      const body = await ctx.request.body().value;
      const { username, password, inviteCode } = body;
      
      if (!username || !password || !inviteCode) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Username, password, and invite code are required" };
        return;
      }
      
      // Validate the invite code
      const isValidInvite = await validateInviteCode(db, inviteCode);
      if (!isValidInvite) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Invalid or expired invite code" };
        return;
      }
      
      // Check if username is available
      const existingUser = await db.find({
        selector: { 
          type: "account",
          username: username 
        },
        limit: 1
      });
      
      if (existingUser.docs.length > 0) {
        ctx.response.status = 409;
        ctx.response.body = { error: "Username already taken" };
        return;
      }
      
      // Generate RSA keypair
      const { publicKey, privateKey } = await generateRSAKeypair();
      
      // Generate DID from public key
      const did = await generateDID(publicKey);
      
      // Hash the password
      const passwordHash = await bcrypt.hash(password);
      
      // Encrypt the private key with the password
      const encryptedPrivateKey = await encryptWithPassword(privateKey, password);
      
      // Create the account
      const account = {
        _id: `account:${username}`,
        type: "account",
        did,
        username,
        passwordHash,
        publicKey,
        encryptedPrivateKey,
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      };
      
      // Save to database
      await db.put(account);
      
      // Mark invite as used
      await markInviteAsUsed(db, inviteCode, username);
      
      // Return success
      ctx.response.status = 201;
      ctx.response.body = { 
        success: true,
        did,
        username
      };
    } catch (error) {
      console.error("Registration error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  });
  
  // Invite code generation (admin only)
  router.post("/api/auth/invite", async (ctx: Context) => {
    try {
      // In a real implementation, this would check admin authentication
      // For now, we'll assume the request is authenticated
      
      const body = await ctx.request.body().value;
      const { maxUses = 1, expiresInDays = 30 } = body;
      
      // Generate a random invite code
      const code = generateInviteCode();
      
      // Calculate expiration date
      const expires = new Date();
      expires.setDate(expires.getDate() + expiresInDays);
      
      // Create invite document
      const invite = {
        _id: `invite:${code}`,
        type: "invite",
        code,
        createdBy: "admin", // Would be the actual admin username
        created: new Date().toISOString(),
        expires: expires.toISOString(),
        maxUses,
        usedCount: 0,
        usedBy: []
      };
      
      // Save to database
      await db.put(invite);
      
      // Return the invite code
      ctx.response.body = { 
        code,
        expires: expires.toISOString(),
        maxUses
      };
    } catch (error) {
      console.error("Invite generation error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  });
  
  return router;
}

// Helper functions

async function generateSessionToken(did: string, username: string): Promise<string> {
  // In a real implementation, this would use a proper JWT library
  // For simplicity, we'll just create a basic token structure
  
  const payload = {
    did,
    username,
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    iat: Math.floor(Date.now() / 1000)
  };
  
  // In production, use a proper key management system
  // For now, we'll use a simple HMAC
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  
  // This is a simplified example - in production use a proper JWT library
  const signature = await crypto.subtle.digest('SHA-256', data);
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  // Create a simple token format
  return btoa(JSON.stringify(payload)) + '.' + signatureBase64;
}

async function validateInviteCode(db: any, code: string): Promise<boolean> {
  try {
    const result = await db.get(`invite:${code}`);
    
    // Check if invite exists
    if (!result) return false;
    
    // Check if invite is expired
    const expires = new Date(result.expires);
    if (expires < new Date()) return false;
    
    // Check if invite has reached max uses
    if (result.usedCount >= result.maxUses) return false;
    
    return true;
  } catch (error) {
    console.error("Invite validation error:", error);
    return false;
  }
}

async function markInviteAsUsed(db: any, code: string, usedBy: string): Promise<void> {
  try {
    const invite = await db.get(`invite:${code}`);
    
    // Update the invite
    invite.usedCount += 1;
    invite.usedBy.push({
      username: usedBy,
      usedAt: new Date().toISOString()
    });
    
    // Save the updated invite
    await db.put(invite);
  } catch (error) {
    console.error("Error marking invite as used:", error);
    throw error;
  }
}

function generateInviteCode(): string {
  // Generate a random code in the format XXXX-XXXX-XXXX-XXXX
  const segments = [];
  for (let i = 0; i < 4; i++) {
    const segment = Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0')
      .toUpperCase();
    segments.push(segment);
  }
  return segments.join('-');
}
