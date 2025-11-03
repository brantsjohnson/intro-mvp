"use client"

import { useState, useRef, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { GradientButton } from "@/components/ui/gradient-button"
import { X, RotateCw, ZoomIn, ZoomOut } from "lucide-react"

interface ImageCropModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (croppedImageUrl: string) => void
  imageUrl: string
}

export function ImageCropModal({ isOpen, onClose, onSave, imageUrl }: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)

  const cropSize = 200 // Size of the circular crop area
  const containerSize = 300 // Size of the container

  useEffect(() => {
    if (!imageUrl || !imageRef.current) {
      setImageLoaded(false)
      return
    }

    const img = imageRef.current
    
    // Reset loaded state when imageUrl changes
    setImageLoaded(false)
    // Don't reset scale/position here - will be set in handleLoad
    
    const handleLoad = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setImageLoaded(true)
        
        // Calculate initial scale to fit image to SMALLEST dimension of container
        // This ensures the entire image is visible initially
        const scaleToFitWidth = containerSize / img.naturalWidth
        const scaleToFitHeight = containerSize / img.naturalHeight
        
        // Use the smaller scale so the image fits entirely within the container
        const initialScale = Math.min(scaleToFitWidth, scaleToFitHeight)
        
        // Ensure we can zoom out at least a bit (don't make initial scale too small)
        // But always start with image fitting within container
        setScale(Math.max(0.5, initialScale))
        
        // Center the image initially
        // With scale applied, calculate centered position
        const scaledWidth = img.naturalWidth * initialScale
        const scaledHeight = img.naturalHeight * initialScale
        const centerX = (containerSize - scaledWidth) / 2
        const centerY = (containerSize - scaledHeight) / 2
        setPosition({ x: centerX, y: centerY })
        
        console.log('Image loaded:', {
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          initialScale,
          scaledWidth,
          scaledHeight,
          centerX,
          centerY
        })
      }
    }
    
    const handleError = () => {
      console.error('Failed to load image')
      setImageLoaded(false)
    }
    
    // Remove any existing handlers to avoid duplicates
    img.onload = null
    img.onerror = null
    
    // Set new handlers
    img.onload = handleLoad
    img.onerror = handleError
    
    // Check if image is already loaded (cached images may already be complete)
    // Use setTimeout to check after DOM updates
    const checkComplete = () => {
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        handleLoad()
      }
    }
    
    // Check immediately and after a short delay to catch cached images
    checkComplete()
    const timeoutId = setTimeout(checkComplete, 100)
    
    return () => {
      clearTimeout(timeoutId)
      // Cleanup handlers
      if (img) {
        img.onload = null
        img.onerror = null
      }
    }
  }, [imageUrl]) // Only depend on imageUrl, not scale

  const handleMouseDown = (e: React.MouseEvent) => {
    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    setIsDragging(true)
    setDragStart({
      x: mouseX - position.x,
      y: mouseY - position.y
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    
    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    const newX = e.clientX - rect.left - dragStart.x
    const newY = e.clientY - rect.top - dragStart.y
    
    // Constrain movement to keep image within bounds
    const img = imageRef.current
    if (img && imageLoaded) {
      const scaledWidth = img.naturalWidth * scale
      const scaledHeight = img.naturalHeight * scale
      
      // Calculate bounds - image should not go too far outside container
      const minX = Math.min(0, containerSize - scaledWidth)
      const maxX = 0
      const minY = Math.min(0, containerSize - scaledHeight)
      const maxY = 0
      
      setPosition({
        x: Math.max(minX, Math.min(maxX, newX)),
        y: Math.max(minY, Math.min(maxY, newY))
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Use native event listener for wheel to avoid passive listener issues
  useEffect(() => {
    if (!isOpen || !imageRef.current) return
    
    const container = imageRef.current.parentElement
    if (!container) return
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.max(0.5, Math.min(3, scale * delta))
      setScale(newScale)
    }
    
    container.addEventListener('wheel', handleWheel, { passive: false })
    
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [isOpen, scale])

  const cropImage = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img || !imageLoaded) {
      console.error('Crop failed: missing canvas, image, or image not loaded', {
        hasCanvas: !!canvas,
        hasImg: !!img,
        imageLoaded
      })
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      console.error('Crop failed: cannot get canvas context')
      return
    }

    console.log('Cropping image:', {
      position,
      scale,
      imgWidth: img.naturalWidth,
      imgHeight: img.naturalHeight,
      containerSize,
      cropSize
    })

    // Set canvas size
    canvas.width = cropSize
    canvas.height = cropSize

    // Clear canvas
    ctx.clearRect(0, 0, cropSize, cropSize)

    // Create circular clipping path
    ctx.beginPath()
    ctx.arc(cropSize / 2, cropSize / 2, cropSize / 2, 0, 2 * Math.PI)
    ctx.clip()

    // Calculate the crop area center (middle of container)
    const cropCenterX = containerSize / 2
    const cropCenterY = containerSize / 2
    const cropRadius = cropSize / 2

    // Calculate the visible region in container coordinates
    // The crop circle is centered in the container
    const cropLeft = cropCenterX - cropRadius
    const cropTop = cropCenterY - cropRadius

    // Convert container coordinates to image coordinates
    // Position is the offset of the image's top-left corner from container's top-left
    // The image is scaled, so we need to divide by scale
    const imageX = (cropLeft - position.x) / scale
    const imageY = (cropTop - position.y) / scale
    const imageCropSize = cropSize / scale

    console.log('Crop calculations:', {
      cropLeft,
      cropTop,
      imageX,
      imageY,
      imageCropSize
    })

    // Draw the cropped image
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

      console.log('Image drawn to canvas successfully')
    } catch (error) {
      console.error('Error drawing image to canvas:', error)
      return
    }

    // Convert to blob and create URL
    canvas.toBlob((blob) => {
      if (blob) {
        console.log('Canvas converted to blob, size:', blob.size)
        const croppedUrl = URL.createObjectURL(blob)
        console.log('Blob URL created:', croppedUrl)
        onSave(croppedUrl)
      } else {
        console.error('Failed to convert canvas to blob')
      }
    }, 'image/jpeg', 0.9)
  }

  const handleSave = () => {
    console.log('Save button clicked, imageLoaded:', imageLoaded)
    if (!imageLoaded) {
      console.error('Cannot save: image not loaded')
      return
    }
    
    try {
      cropImage()
      onClose()
    } catch (error) {
      console.error('Error in handleSave:', error)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Your Photo</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Crop area */}
          <div className="relative mx-auto" style={{ width: containerSize, height: containerSize }}>
            <div
              className="relative overflow-hidden border-2 border-primary rounded-full"
              style={{ width: containerSize, height: containerSize }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Image */}
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Profile preview"
                className="absolute select-none"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                  transformOrigin: 'top left',
                  width: imageLoaded && imageRef.current
                    ? `${imageRef.current.naturalWidth}px`
                    : 'auto',
                  height: imageLoaded && imageRef.current
                    ? `${imageRef.current.naturalHeight}px`
                    : 'auto',
                  // No objectFit - we want to preserve exact dimensions
                  maxWidth: 'none',
                  maxHeight: 'none'
                }}
                draggable={false}
              />
              
              {/* Circular mask overlay */}
              <div className="absolute inset-0 rounded-full border-2 border-white shadow-inner" />
            </div>
            
            {/* Crop circle indicator */}
            <div
              className="absolute inset-0 rounded-full border-2 border-primary pointer-events-none"
              style={{ width: cropSize, height: cropSize, left: (containerSize - cropSize) / 2, top: (containerSize - cropSize) / 2 }}
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScale(Math.max(0.5, scale - 0.1))}
              disabled={scale <= 0.5}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            
            <span className="text-sm text-muted-foreground">
              {Math.round(scale * 100)}%
            </span>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScale(Math.min(3, scale + 0.1))}
              disabled={scale >= 3}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground text-center">
            Drag to position • Pinch or scroll to zoom
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
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
