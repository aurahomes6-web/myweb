import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Calendar } from 'lucide-react'
import GlowBackground from '@/components/ui/GlowBackground'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export default function CTASection() {
  const reduced = useReducedMotion()

  return (
    <section id="availability" className="relative overflow-hidden py-28 lg:py-40">
      <GlowBackground className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-magenta/40 to-transparent" />

      <div className="relative z-10 mx-auto max-w-4xl px-5 text-center sm:px-8">
        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 40, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true, margin: '-60px' }}
        >
          <p className="mb-8 text-[11px] font-medium uppercase tracking-[0.34em] text-text-secondary">
            Begin Your Stay
          </p>

          <h2 className="font-display text-[clamp(2.6rem,7vw,5rem)] font-bold leading-[0.95] tracking-tight text-text-primary">
            YOUR NEXT STAY
            <span className="block text-gradient">STARTS HERE.</span>
          </h2>

          <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
            Select your dates. Reserve at your pace. Three private rooftop suites,
            waiting for the moment you arrive.
          </p>

          <div className="mt-11 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
            <Link
              to="/book"
              className="group inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left px-9 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-ink shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta sm:w-auto"
            >
              Book Your Stay
              <ArrowRight
                size={16}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
            <Link
              to="/properties"
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-full border border-surface-300/80 px-9 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-text-primary backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan/45 hover:shadow-glow-cyan sm:w-auto"
            >
              <Calendar size={16} className="text-cyan-bright" />
              Explore Homes
            </Link>
          </div>

          <p className="mt-10 text-xs tracking-[0.2em] uppercase text-text-muted">
            Three rooftop suites · Premium stays · Thoughtfully designed
          </p>
        </motion.div>
      </div>
    </section>
  )
}