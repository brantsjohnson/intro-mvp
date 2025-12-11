"use client"

import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { GradientButton } from "@/components/ui/gradient-button"
import { ZoomIn, ZoomOut } from "lucide-react"

interface ImageCropModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (croppedImageUrl: string) => void
  imageUrl: string
}

export function ImageCropModal({ isOpen, onClose, onSave, imageUrl }: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })

  const cropSize = 600 // Size of the circular crop area (increased for better resolution)
  const containerSize = 300 // Size of the container (display size)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setImageLoaded(false)
      setImageDimensions({ width: 0, height: 0 })
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }, [isOpen])

  // Initialize image when it loads
  useEffect(() => {
    if (!isOpen || !imageUrl) {
      setImageLoaded(false)
      return
    }

    // Create a new image element to load
    const img = new Image()
    
    // Only set crossOrigin for external URLs, not data URLs or blob URLs
    if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous'
    }
    
    const handleLoad = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const imgWidth = img.naturalWidth
        const imgHeight = img.naturalHeight
        
        setImageDimensions({ width: imgWidth, height: imgHeight })
        setImageLoaded(true)
        
        // Find shortest dimension (width or height) - this is what fills the crop circle
        const shortestDimension = Math.min(imgWidth, imgHeight)
        const longestDimension = Math.max(imgWidth, imgHeight)
        const isPortrait = imgHeight > imgWidth
        
        // Calculate scale so shortest dimension EXACTLY fills the crop circle (200px)
        // This ensures no extra space - the shorter side fills the circle completely
        const initialScale = cropSize / shortestDimension
        
        setScale(initialScale)
        
        // Calculate scaled dimensions after applying scale
        const scaledWidth = imgWidth * initialScale
        const scaledHeight = imgHeight * initialScale
        
        // Verify: shortest scaled dimension should equal cropSize (200px)
        const scaledShortest = Math.min(scaledWidth, scaledHeight)
        const scaledLongest = Math.max(scaledWidth, scaledHeight)
        
        // Center the image so crop circle aligns with image center
        // The crop circle is centered in the container at (150, 150)
        const cropCenterX = containerSize / 2
        const cropCenterY = containerSize / 2
        
        // Position image so its center aligns with crop circle center
        // This ensures the crop circle captures the center of the image
        const imageCenterX = scaledWidth / 2
        const imageCenterY = scaledHeight / 2
        
        const centerX = cropCenterX - imageCenterX
        const centerY = cropCenterY - imageCenterY
        
        setPosition({ x: centerX, y: centerY })
        
        console.log('Image sizing (shortest side fills circle):', {
          original: { width: imgWidth, height: imgHeight },
          shortestDimension,
          longestDimension,
          isPortrait,
          initialScale,
          scaled: { width: scaledWidth, height: scaledHeight },
          scaledShortest, // Should equal cropSize (200px)
          scaledLongest,  // Will be larger, extending beyond circle
          cropSize,
          position: { x: centerX, y: centerY }
        })
      }
    }
    
    const handleError = (error: any) => {
      console.error('Failed to load image:', error, imageUrl)
      setImageLoaded(false)
    }
    
    img.onload = handleLoad
    img.onerror = handleError
    
    // Set src to trigger load
    try {
      img.src = imageUrl
    } catch (error) {
      console.error('Error setting image src:', error)
      setImageLoaded(false)
    }
    
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [imageUrl, isOpen])

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setDragStart({
        x: e.clientX - rect.left - position.x,
        y: e.clientY - rect.top - position.y
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    e.preventDefault()
    
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      const newX = e.clientX - rect.left - dragStart.x
      const newY = e.clientY - rect.top - dragStart.y
      
      // Allow free movement - no bounds restriction
      setPosition({ x: newX, y: newY })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    const touch = e.touches[0]
    setIsDragging(true)
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setDragStart({
        x: touch.clientX - rect.left - position.x,
        y: touch.clientY - rect.top - position.y
      })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    e.preventDefault()
    
    const touch = e.touches[0]
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      const newX = touch.clientX - rect.left - dragStart.x
      const newY = touch.clientY - rect.top - dragStart.y
      
      setPosition({ x: newX, y: newY })
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  // Zoom handlers
  const handleZoomIn = () => {
    setScale(prev => {
      const newScale = prev * 1.2
      return Math.min(5, newScale)
    })
  }

  const handleZoomOut = () => {
    setScale(prev => {
      const newScale = prev / 1.2
      // Allow zooming out to at least 0.1 (10%) for very small images
      return Math.max(0.1, newScale)
    })
  }

  // Wheel zoom
  useEffect(() => {
    if (!isOpen || !containerRef.current) return
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setScale(prev => {
        const newScale = prev * delta
        return Math.max(0.1, Math.min(5, newScale))
      })
    }
    
    containerRef.current.addEventListener('wheel', handleWheel, { passive: false })
    
    return () => {
      containerRef.current?.removeEventListener('wheel', handleWheel)
    }
  }, [isOpen])

  // Pinch zoom for touch devices
  useEffect(() => {
    if (!isOpen || !containerRef.current) return
    
    let lastDistance = 0
    
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        lastDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
      }
    }
    
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
        
        if (lastDistance > 0) {
          const scaleChange = distance / lastDistance
          setScale(prev => {
            const newScale = prev * scaleChange
            return Math.max(0.1, Math.min(5, newScale))
          })
        }
        
        lastDistance = distance
      }
    }
    
    containerRef.current.addEventListener('touchstart', handleTouchStart, { passive: false })
    containerRef.current.addEventListener('touchmove', handleTouchMove, { passive: false })
    
    return () => {
      containerRef.current?.removeEventListener('touchstart', handleTouchStart)
      containerRef.current?.removeEventListener('touchmove', handleTouchMove)
    }
  }, [isOpen])

  // Crop and save image
  const cropImage = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    
    if (!canvas || !img || !imageLoaded) {
      console.error('Cannot crop: missing elements or image not loaded')
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.error('Cannot get canvas context')
      return
    }

    // Set canvas size
    canvas.width = cropSize
    canvas.height = cropSize

    // Clear canvas
    ctx.clearRect(0, 0, cropSize, cropSize)

    // Create circular clipping path
    ctx.beginPath()
    ctx.arc(cropSize / 2, cropSize / 2, cropSize / 2, 0, 2 * Math.PI)
    ctx.clip()

    // Calculate crop area center in container coordinates
    const cropCenterX = containerSize / 2
    const cropCenterY = containerSize / 2
    const cropRadius = cropSize / 2

    // Calculate the crop area bounds in container coordinates
    const cropLeft = cropCenterX - cropRadius
    const cropTop = cropCenterY - cropRadius

    // Convert container coordinates to image coordinates
    // Position is where the image's top-left corner is relative to container
    const imageX = (cropLeft - position.x) / scale
    const imageY = (cropTop - position.y) / scale
    const imageCropSize = cropSize / scale

    // Draw the cropped portion of the image
    try {
      ctx.drawImage(
        img,
        imageX,
        imageY,
        imageCropSize,
        imageCropSize,
        0,
        0,
        cropSize,
        cropSize
      )

      // Convert to blob and create URL with high quality JPEG
      // Using 0.98 quality for excellent quality while maintaining reasonable file size
      canvas.toBlob((blob) => {
        if (blob) {
          const croppedUrl = URL.createObjectURL(blob)
          onSave(croppedUrl)
        } else {
          console.error('Failed to convert canvas to blob')
        }
      }, 'image/jpeg', 0.98) // High quality JPEG (0.98 instead of 0.95)
    } catch (error) {
      console.error('Error cropping image:', error)
    }
  }

  const handleSave = () => {
    if (!imageLoaded) {
      console.error('Cannot save: image not loaded')
      return
    }
    
    try {
      cropImage()
      onClose()
    } catch (error) {
      console.error('Error saving image:', error)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Your Photo</DialogTitle>
          <DialogDescription>
            Drag to position your photo and use zoom controls to adjust the size
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Crop area */}
          <div 
            ref={containerRef}
            className="relative mx-auto select-none"
            style={{ width: containerSize, height: containerSize }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Container with circular mask */}
            <div
              className="relative overflow-hidden rounded-2xl border-2 border-primary"
              style={{ width: containerSize, height: containerSize }}
            >
              {/* Image */}
              {imageLoaded && imageDimensions.width > 0 && (
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Profile preview"
                  className="absolute pointer-events-none"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transformOrigin: 'top left',
                    width: `${imageDimensions.width}px`,
                    height: `${imageDimensions.height}px`,
                    maxWidth: 'none',
                    maxHeight: 'none',
                  }}
                  draggable={false}
                  onLoad={() => {
                    // Ensure image is marked as loaded when it actually loads
                    if (imageRef.current && imageRef.current.naturalWidth > 0) {
                      setImageLoaded(true)
                    }
                  }}
                  onError={() => {
                    console.error('Image failed to load in img element')
                    setImageLoaded(false)
                  }}
                />
              )}
              
              {/* Loading state */}
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#EDEBE6]">
                  <div className="text-muted-foreground">Loading image...</div>
                </div>
              )}
              
              {/* Error state */}
              {imageUrl && !imageLoaded && imageDimensions.width === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#EDEBE6]">
                  <div className="text-destructive text-sm">Failed to load image</div>
                </div>
              )}
            </div>
            
            {/* Crop circle indicator overlay */}
            <div
              className="absolute pointer-events-none rounded-2xl border-2 border-white shadow-lg"
              style={{ 
                width: cropSize, 
                height: cropSize, 
                left: (containerSize - cropSize) / 2, 
                top: (containerSize - cropSize) / 2 
              }}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={scale <= 0.1}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            
            <span className="text-sm text-muted-foreground min-w-[60px] text-center">
              {Math.round(scale * 100)}%
            </span>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={scale >= 5}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Drag to position • Pinch or scroll to zoom
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-between gap-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <GradientButton onClick={handleSave} disabled={!imageLoaded}>
            Save Photo
          </GradientButton>
        </div>

        {/* Hidden canvas for cropping */}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  )
}
