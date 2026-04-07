/**
 * Haptic feedback utility functions for providing tactile responses
 */

export const haptics = {
  /**
   * Light tap feedback - for button presses, selections
   */
  light: () => {
    if (typeof window !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10)
    }
  },

  /**
   * Medium feedback - for confirmations, successful actions
   */
  medium: () => {
    if (typeof window !== "undefined" && navigator.vibrate) {
      navigator.vibrate(20)
    }
  },

  /**
   * Success feedback - for completed actions
   */
  success: () => {
    if (typeof window !== "undefined" && navigator.vibrate) {
      // Double pulse pattern
      navigator.vibrate([30, 50, 30])
    }
  },

  /**
   * Error feedback - for failed actions
   */
  error: () => {
    if (typeof window !== "undefined" && navigator.vibrate) {
      // Three short pulses
      navigator.vibrate([20, 50, 20, 50, 20])
    }
  },

  /**
   * Celebration feedback - for major achievements
   */
  celebration: () => {
    if (typeof window !== "undefined" && navigator.vibrate) {
      // Crescendo pattern
      navigator.vibrate([50, 50, 100, 50, 200])
    }
  },

  /**
   * Scan feedback - for QR code scanning
   */
  scan: () => {
    if (typeof window !== "undefined" && navigator.vibrate) {
      // Quick beep pattern
      navigator.vibrate([15, 30, 15])
    }
  },
}



