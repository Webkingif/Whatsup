/**
 * WhisperBox Crypto Utility
 * Implements Web Crypto API for RSA-OAEP 2048-bit and AES-GCM 256-bit encryption.
 */

// Helper: String to ArrayBuffer
export function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

// Helper: ArrayBuffer to Base64
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper: Base64 to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generates a new RSA-OAEP 2048-bit keypair
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: 'SHA-256',
    },
    true, // extractable
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

// Generates random salt for password hashing (128-bit)
export function generateSalt(): string {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  return arrayBufferToBase64(salt);
}

// Derives a PBKDF2 key from a password and salt
export async function deriveKeyFromPassword(password: string, saltHexOrBase64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordBuffer = enc.encode(password);
  
  // Using Base64 salt for consistency
  const saltBuffer = base64ToArrayBuffer(saltHexOrBase64);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-KW', length: 256 }, // AES Key Wrap
    true,
    ['wrapKey', 'unwrapKey']
  );
}

// Wraps an RSA Private Key with an AES-KW key derived from the password
export async function wrapPrivateKey(privateKey: CryptoKey, wrappingKey: CryptoKey): Promise<string> {
  // 1. Export as JWK to enforce a parsable string format
  const jwk = await window.crypto.subtle.exportKey('jwk', privateKey);
  const jwkString = JSON.stringify(jwk);
  
  // 2. Pad the JWK string with spaces to align perfectly with AES-KW's 8-byte requirement
  const encoder = new TextEncoder();
  let jwkBytes = encoder.encode(jwkString);
  const remainder = jwkBytes.length % 8;
  if (remainder !== 0) {
    const padding = 8 - remainder;
    const padded = new Uint8Array(jwkBytes.length + padding);
    padded.set(jwkBytes);
    for (let i = 0; i < padding; i++) {
        padded[jwkBytes.length + i] = 0x20; // space character
    }
    jwkBytes = padded;
  }

  // 3. Import as an unbounded raw HMAC key to safely pass to wrapKey
  const dummyKey = await window.crypto.subtle.importKey(
    'raw',
    jwkBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign']
  );

  // 4. Wrap with AES-KW
  const wrapped = await window.crypto.subtle.wrapKey(
    'raw',
    dummyKey,
    wrappingKey,
    'AES-KW'
  );
  return arrayBufferToBase64(wrapped);
}

// Unwraps an RSA Private Key with an AES-KW key derived from the password
export async function unwrapPrivateKey(wrappedKeyBase64: string, unwrappingKey: CryptoKey): Promise<CryptoKey> {
  const wrappedKeyBuffer = base64ToArrayBuffer(wrappedKeyBase64);
  
  // 1. Unwrap the raw AES-KW payload back into a dummy HMAC key
  const dummyKey = await window.crypto.subtle.unwrapKey(
    'raw',
    wrappedKeyBuffer,
    unwrappingKey,
    'AES-KW',
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign']
  );

  // 2. Export the dummy key to get our padded JWK bytes
  const paddedJwkBytes = await window.crypto.subtle.exportKey('raw', dummyKey);

  // 3. Decode and remove the space padding
  const decoder = new TextDecoder();
  const jwkString = decoder.decode(paddedJwkBytes).trim();
  const jwk = JSON.parse(jwkString);

  // 4. Reconstruct the RSA-OAEP CryptoKey
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    false,
    ['decrypt', 'unwrapKey']
  );
}

// Export Public Key to SPKI Base64
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(exported);
}

// Import Public Key from SPKI Base64
export async function importPublicKey(spkiBase64: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(spkiBase64);
  return window.crypto.subtle.importKey(
    'spki',
    buffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'wrapKey']
  );
}

export interface EncryptedMessagePayload {
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  encryptedKeyForSelf: string;
}

// Encrypts a message using a random AES-GCM key, and encrypts that key with recipient and sender public keys
export async function encryptMessage(
  plaintext: string,
  recipientPublicKey: CryptoKey,
  senderPublicKey: CryptoKey
): Promise<EncryptedMessagePayload> {
  
  // 1. Generate random AES-GCM 256-bit key
  const aesKey = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );

  // 2. Encrypt the plaintext with AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encodedPlaintext = new TextEncoder().encode(plaintext);
  
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    aesKey,
    encodedPlaintext
  );

  // 3. Export the AES key so we can wrap it with RSA-OAEP
  const encryptedKeyBuffer = await window.crypto.subtle.wrapKey(
    'raw',
    aesKey,
    recipientPublicKey,
    'RSA-OAEP'
  );

  const encryptedKeyForSelfBuffer = await window.crypto.subtle.wrapKey(
    'raw',
    aesKey,
    senderPublicKey,
    'RSA-OAEP'
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv),
    encryptedKey: arrayBufferToBase64(encryptedKeyBuffer),
    encryptedKeyForSelf: arrayBufferToBase64(encryptedKeyForSelfBuffer),
  };
}

// Decrypts an incoming message payload
export async function decryptMessage(
  payload: EncryptedMessagePayload,
  myPrivateKey: CryptoKey,
  isSender: boolean = false
): Promise<string> {
  
  // 1. Extract the correct encrypted AES key
  const targetEncryptedKeyBase64 = isSender ? payload.encryptedKeyForSelf : payload.encryptedKey;
  const encryptedKeyBuffer = base64ToArrayBuffer(targetEncryptedKeyBase64);

  // 2. Unwrap the AES key
  const aesKey = await window.crypto.subtle.unwrapKey(
    'raw',
    encryptedKeyBuffer,
    myPrivateKey,
    'RSA-OAEP',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  // 3. Decrypt the ciphertext
  const ivBuffer = base64ToArrayBuffer(payload.iv);
  const ciphertextBuffer = base64ToArrayBuffer(payload.ciphertext);

  const plaintextBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
    },
    aesKey,
    ciphertextBuffer
  );

  return new TextDecoder().decode(plaintextBuffer);
}
