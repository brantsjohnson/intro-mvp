/**
 * Event Code Encryption Utility
 * 
 * Encrypts/decrypts event codes for use in URLs.
 * Uses base64url encoding for URL-safe encryption.
 */

/**
 * Encrypt an event code to a URL-safe string
 * @param code - The event code (e.g., "RG1212")
 * @returns Encrypted code suitable for URLs
 */
export function encryptEventCode(code: string): string {
  try {
    // Convert to base64, then make it URL-safe
    const base64 = btoa(code.toUpperCase())
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  } catch (error) {
    console.error('Error encrypting event code:', error)
    throw new Error('Failed to encrypt event code')
  }
}

/**
 * Decrypt an encrypted event code back to the original code
 * @param encrypted - The encrypted code from URL
 * @returns Original event code or null if invalid
 */
export function decryptEventCode(encrypted: string): string | null {
  try {
    // Reverse the URL-safe base64 encoding
    let base64 = encrypted
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '='
    }
    
    const decoded = atob(base64)
    
    // Validate it's a valid event code (6 alphanumeric characters)
    if (decoded.length === 6 && /^[A-Z0-9]+$/.test(decoded)) {
      return decoded
    }
    
    return null
  } catch (error) {
    console.error('Error decrypting event code:', error)
    return null
  }
}
