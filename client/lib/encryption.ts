const ENCRYPTION_KEY = "messenger_secret_key_2024";

function simpleEncrypt(text: string, key: string): string {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  try {
    return btoa(unescape(encodeURIComponent(result)));
  } catch {
    return btoa(result);
  }
}

function simpleDecrypt(encoded: string, key: string): string {
  try {
    let decoded: string;
    try {
      decoded = decodeURIComponent(escape(atob(encoded)));
    } catch {
      decoded = atob(encoded);
    }
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  } catch {
    return encoded;
  }
}

export function encryptMessage(message: string): string {
  return simpleEncrypt(message, ENCRYPTION_KEY);
}

export function decryptMessage(encryptedMessage: string): string {
  return simpleDecrypt(encryptedMessage, ENCRYPTION_KEY);
}

export async function generateMessageHash(message: string): Promise<string> {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    const char = message.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
