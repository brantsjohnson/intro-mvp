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
    if (imageUrl && imageRef.current) {
      const img = imageRef.current
      img.onload = () => {
        setImageLoaded(true)
        // Center the image initially
        const centerX = (containerSize - img.naturalWidth * scale) / 2
        const centerY = (containerSize - img.naturalHeight * scale) / 2
        setPosition({ x: centerX, y: centerY })
      }
    }
  }, [imageUrl, scale])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    
    const newX = e.clientX - dragStart.x
    const newY = e.clientY - dragStart.y
    
    // Constrain movement to keep image within bounds
    const img = imageRef.current
    if (img) {
      const imgWidth = img.naturalWidth * scale
      const imgHeight = img.naturalHeight * scale
      
      const maxX = Math.max(0, imgWidth - containerSize)
      const maxY = Math.max(0, imgHeight - containerSize)
      
      setPosition({
        x: Math.max(-maxX, Math.min(0, newX)),
        y: Math.max(-maxY, Math.min(0, newY))
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.5, Math.min(3, scale * delta))
    setScale(newScale)
  }

  const cropImage = () => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img || !imageLoaded) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    canvas.width = cropSize
    canvas.height = cropSize

    // Create circular clipping path
    ctx.beginPath()
    ctx.arc(cropSize / 2, cropSize / 2, cropSize / 2, 0, 2 * Math.PI)
    ctx.clip()

    // Calculate source rectangle
    const sourceX = -position.x
    const sourceY = -position.y
    const sourceWidth = containerSize
    const sourceHeight = containerSize

    // Draw the cropped image
    ctx.drawImage(
      img,
      sourceX / scale,
      sourceY / scale,
      sourceWidth / scale,
      sourceHeight / scale,
      0,
      0,
      cropSize,
      cropSize
    )

    // Convert to blob and create URL
    canvas.toBlob((blob) => {
      if (blob) {
        const croppedUrl = URL.createObjectURL(blob)
        onSave(croppedUrl)
      }
    }, 'image/jpeg', 0.9)
  }

  const handleSave = () => {
    cropImage()
    onClose()
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
              onWheel={handleWheel}
            >
              {/* Image */}
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Profile preview"
                className="absolute select-none"
                style={{
                  transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                  transformOrigin: 'center center',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover'
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
