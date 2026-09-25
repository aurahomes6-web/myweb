import Hero from '@/components/sections/Hero'
import { MarqueeNotifications } from '@/components/sections/MarqueeNotifications'
import PropertiesSection from '@/components/sections/PropertiesSection'
import FeatureSection from '@/components/sections/FeatureSection'
import CTASection from '@/components/sections/CTASection'

export default function HomePage() {
  return (
    <>
      <Hero />
      <MarqueeNotifications />
      <PropertiesSection />
      <FeatureSection />
      <CTASection />
    </>
  )
}