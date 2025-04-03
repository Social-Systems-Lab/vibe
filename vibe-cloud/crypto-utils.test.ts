import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  generateRSAKeypair,
  signData,
  verifySignature,
  encryptWithPassword,
  decryptWithPassword,
  generateDID
} from "./crypto-utils.ts";

Deno.test("RSA key generation", async () => {
  const { publicKey, privateKey } = await generateRSAKeypair();
  
  // Check that keys are generated and in PEM format
  assertNotEquals(publicKey, undefined);
  assertNotEquals(privateKey, undefined);
  
  // Verify PEM format
  assertEquals(publicKey.startsWith("-----BEGIN PUBLIC KEY-----"), true);
  assertEquals(privateKey.startsWith("-----BEGIN PRIVATE KEY-----"), true);
  
  console.log("Generated RSA keypair successfully");
});

Deno.test("Signing and verification", async () => {
  const { publicKey, privateKey } = await generateRSAKeypair();
  const testData = "Hello, world!";
  
  // Sign the data
  const signature = await signData(privateKey, testData);
  assertNotEquals(signature, undefined);
  
  // Verify the signature
  const isValid = await verifySignature(publicKey, signature, testData);
  assertEquals(isValid, true);
  
  // Verify that an invalid signature fails
  const isInvalid = await verifySignature(publicKey, signature, "Different data");
  assertEquals(isInvalid, false);
  
  console.log("Signature verification successful");
});

Deno.test("Password-based encryption and decryption", async () => {
  const testData = "Secret message";
  const password = "test-password";
  
  // Encrypt the data
  const encrypted = await encryptWithPassword(testData, password);
  assertNotEquals(encrypted, undefined);
  assertNotEquals(encrypted, testData);
  
  // Decrypt the data
  const decrypted = await decryptWithPassword(encrypted, password);
  assertEquals(decrypted, testData);
  
  // Try with wrong password
  try {
    await decryptWithPassword(encrypted, "wrong-password");
    // Should not reach here
    assertEquals(true, false, "Decryption with wrong password should fail");
  } catch (error) {
    // Expected to fail
    console.log("Decryption with wrong password failed as expected");
  }
  
  console.log("Password-based encryption and decryption successful");
});

Deno.test("DID generation", async () => {
  const { publicKey } = await generateRSAKeypair();
  
  // Generate DID
  const did = await generateDID(publicKey);
  assertNotEquals(did, undefined);
  
  // Verify DID format
  assertEquals(did.startsWith("did:vibe:"), true);
  
  // Generate another DID and ensure they're different
  const { publicKey: publicKey2 } = await generateRSAKeypair();
  const did2 = await generateDID(publicKey2);
  assertNotEquals(did, did2);
  
  console.log("DID generation successful");
});
