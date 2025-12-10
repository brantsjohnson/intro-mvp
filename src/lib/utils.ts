import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { createClientComponentClient } from "./supabase"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts a photo_url from Supabase to a public avatar URL.
 * Handles both full URLs (http/https) and storage paths.
 * 
 * @param photoUrl - The photo_url from the users table (can be null, a full URL, or a storage path)
 * @returns The public URL for the avatar, or null if photoUrl is null/empty/invalid
 */
export function getAvatarUrl(photoUrl: string | null | undefined): string | null {
  // Handle null/undefined/empty
  if (!photoUrl || typeof photoUrl !== 'string') return null
  
  // Trim whitespace
  const trimmed = photoUrl.trim()
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null
  
  // If it's already a full URL (http/https), return as-is
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  
  // If it's a storage path, convert to public URL
  // Only run in browser context (client-side)
  if (typeof window === 'undefined') {
    console.warn('getAvatarUrl called server-side, cannot generate storage URL:', trimmed)
    return null
  }
  
  try {
    const supabase = createClientComponentClient()
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(trimmed)
    
    if (!urlData?.publicUrl) {
      console.warn('Failed to get public URL for avatar path:', trimmed)
      return null
    }
    
    return urlData.publicUrl
  } catch (error) {
    console.error('Error getting public URL for avatar:', error, 'photoUrl:', photoUrl)
    return null // Return null on error instead of potentially invalid path
  }
}
