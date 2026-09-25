import { useState } from 'react'
import PropertyVisual from '@/components/visuals/PropertyVisual'
import { imageAssets } from '@/config/images'

export interface HomepageVisualProps {
  imageUrl: string | null
  imageAlt: string
}

export function HomepageVisual({ imageUrl, imageAlt }: HomepageVisualProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)

  const customImage = imageUrl !== null && imageUrl !== failedImageUrl ? imageUrl : null

  return (
    <PropertyVisual
      image={customImage ?? imageAssets.hero}
      accent="purple"
      variant="moon"
      label={imageAlt}
      onImageError={customImage ? () => setFailedImageUrl(customImage) : undefined}
    />
  )
}
