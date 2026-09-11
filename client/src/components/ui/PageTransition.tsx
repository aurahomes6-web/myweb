import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export default function PageTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()

  return (
    <motion.main
      id="main-content"
      initial={reduced ? undefined : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -10 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-svh"
    >
      {children}
    </motion.main>
  )
}