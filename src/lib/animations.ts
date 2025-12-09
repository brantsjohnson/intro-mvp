"use client"

/**
 * IntersectionObserver utility for scroll-triggered animations
 * Auto-applies .animate-surface-up to containers when they enter the viewport
 */

export function initScrollAnimations() {
  if (typeof window === 'undefined') return

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-surface-up')
          // Unobserve after animation to prevent re-triggering
          observer.unobserve(entry.target)
        }
      })
    },
    {
      threshold: 0.15, // Trigger when 15% of element is visible
      rootMargin: '0px 0px -50px 0px', // Start animation slightly before element enters viewport
    }
  )

  // Observe all containers with data-animate attribute
  const elementsToAnimate = document.querySelectorAll('[data-animate]')
  elementsToAnimate.forEach((el) => observer.observe(el))

  // Also observe all cards and containers
  const containers = document.querySelectorAll('.container-cream, [data-slot="card"]')
  containers.forEach((el) => observer.observe(el))

  return observer
}

/**
 * Initialize scroll animations when DOM is ready
 */
export function setupScrollAnimations() {
  if (typeof window === 'undefined') return

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollAnimations)
  } else {
    initScrollAnimations()
  }
}

