import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { properties } from '@/data/properties'
import PropertyGrid from '@/components/property/PropertyGrid'
import SectionHeading from '@/components/ui/SectionHeading'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export default function PropertiesPage() {
  const reduced = useReducedMotion()

  return (
    <div className="mx-auto max-w-7xl px-5 pb-28 pt-32 sm:px-8 lg:pt-36">
      <motion.div
        initial={reduced ? undefined : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <Link
          to="/"
          className="mb-12 inline-flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft size={15} />
          Back to home
        </Link>

        <SectionHeading
          align="left"
          eyebrow="Our Homes"
          title={
            <>
              THE <span className="text-gradient">COLLECTION</span>
            </>
          }
          description="Three premium penthouse stays, each with its own atmosphere, layout and light. Pick the one that feels like yours."
          className="mb-14"
        />

        <PropertyGrid items={properties} />
      </motion.div>
    </div>
  )
}