/**
 * Cryptographic utilities for vibe-cloud authentication
 */

/**
 * Generates an RSA keypair for authentication
 * @returns Promise containing the public and private keys in PEM format
 */
export async function generateRSAKeypair() {
  // Generate RSA key pair using SubtleCrypto
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]), // 65537
      hash: "SHA-256",
    },
    true, // extractable
    ["sign", "verify"]
  );

  // Export keys to PKCS8 (private) and SPKI (public) formats
  const privateKeyBuffer = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const publicKeyBuffer = await crypto.subtle.exportKey("spki", keyPair.publicKey);

  // Convert to base64 and format as PEM
  const privateKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)));
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer)));

  const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
  const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64.match(/.{1,64}/g)?.join('\n')}\n-----END PUBLIC KEY-----`;

  return {
    privateKey: privateKeyPEM,
    publicKey: publicKeyPEM
  };
}

/**
 * Imports a public key from PEM format
 * @param pemKey Public key in PEM format
 * @returns CryptoKey object
 */
export async function importPublicKey(pemKey: string): Promise<CryptoKey> {
  // Remove PEM header/footer and decode base64
  const pemContents = pemKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  // Import the key
  return await crypto.subtle.importKey(
    'spki',
    binaryDer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    true,
    ['verify']
  );
}

/**
 * Imports a private key from PEM format
 * @param pemKey Private key in PEM format
 * @returns CryptoKey object
 */
export async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // Remove PEM header/footer and decode base64
  const pemContents = pemKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  // Import the key
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    true,
    ['sign']
  );
}

/**
 * Signs data with a private key
 * @param privateKeyPEM Private key in PEM format
 * @param data Data to sign
 * @returns Base64-encoded signature
 */
export async function signData(privateKeyPEM: string, data: string): Promise<string> {
  const privateKey = await importPrivateKey(privateKeyPEM);
  
  // Convert data to Uint8Array
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Sign the data
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: 'RSASSA-PKCS1-v1_5',
    },
    privateKey,
    dataBuffer
  );
  
  // Convert signature to base64
  return btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
}

/**
 * Verifies a signature
 * @param publicKeyPEM Public key in PEM format
 * @param signature Base64-encoded signature
 * @param data Original data that was signed
 * @returns Boolean indicating if signature is valid
 */
export async function verifySignature(publicKeyPEM: string, signature: string, data: string): Promise<boolean> {
  const publicKey = await importPublicKey(publicKeyPEM);
  
  // Convert data to Uint8Array
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Convert base64 signature to Uint8Array
  const signatureBuffer = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
  
  // Verify the signature
  return await crypto.subtle.verify(
    {
      name: 'RSASSA-PKCS1-v1_5',
    },
    publicKey,
    signatureBuffer,
    dataBuffer
  );
}

/**
 * Derives an encryption key from a password
 * @param password User password
 * @param salt Salt for PBKDF2 (will be generated if not provided)
 * @returns Object containing the derived key and salt
 */
export async function deriveKeyFromPassword(password: string, salt?: Uint8Array): Promise<{ key: CryptoKey, salt: Uint8Array }> {
  // Generate salt if not provided
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
  }
  
  // Convert password to Uint8Array
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  // Derive key using PBKDF2
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  return { key, salt };
}

/**
 * Encrypts data with a key derived from a password
 * @param data Data to encrypt
 * @param password Password to derive encryption key from
 * @returns Encrypted data object with all necessary components for decryption
 */
export async function encryptWithPassword(data: string, password: string): Promise<string> {
  // Derive key from password
  const { key, salt } = await deriveKeyFromPassword(password);
  
  // Generate initialization vector
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Convert data to Uint8Array
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Encrypt the data
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    dataBuffer
  );
  
  // Combine salt, iv, and encrypted data
  const encryptedArray = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
  encryptedArray.set(salt, 0);
  encryptedArray.set(iv, salt.length);
  encryptedArray.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);
  
  // Convert to base64 for storage
  return btoa(String.fromCharCode(...encryptedArray));
}

/**
 * Decrypts data that was encrypted with a password
 * @param encryptedData Base64-encoded encrypted data
 * @param password Password used for encryption
 * @returns Decrypted data as string
 */
export async function decryptWithPassword(encryptedData: string, password: string): Promise<string> {
  // Convert base64 to Uint8Array
  const encryptedArray = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  // Extract salt, iv, and encrypted data
  const salt = encryptedArray.slice(0, 16);
  const iv = encryptedArray.slice(16, 28);
  const data = encryptedArray.slice(28);
  
  // Derive key from password and salt
  const { key } = await deriveKeyFromPassword(password, salt);
  
  // Decrypt the data
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    data
  );
  
  // Convert decrypted data to string
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Generates a DID from a public key
 * @param publicKey Public key in PEM format
 * @returns DID string
 */
export async function generateDID(publicKey: string): Promise<string> {
  // Remove PEM header/footer and whitespace
  const pemContents = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  
  // Hash the public key
  const encoder = new TextEncoder();
  const publicKeyBuffer = encoder.encode(pemContents);
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyBuffer);
  
  // Convert hash to base64url format
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));
  const hashBase64Url = hashBase64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  // Create DID
  return `did:vibe:${hashBase64Url}`;
}
