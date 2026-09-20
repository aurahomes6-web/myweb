import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundContent() {
  return (
    <div className="mx-auto flex min-h-[70svh] max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
      <div className="animated-gradient-border flex h-20 w-20 items-center justify-center rounded-full">
        <Compass size={34} className="text-gradient" />
      </div>
      <p className="mt-10 text-xs font-medium uppercase tracking-[0.34em] text-text-muted">
        Page not found
      </p>
      <h1 className="mt-4 font-display text-5xl font-bold tracking-tight text-text-primary sm:text-6xl">
        LOST IN THE <span className="text-gradient">AURA.</span>
      </h1>
      <p className="mt-6 max-w-md text-base leading-relaxed text-text-secondary">
        The page you are looking for doesn't exist or may have moved. Let's get you
        back home.
      </p>
      <Link
        to="/"
        className="mt-10 inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left px-8 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-ink shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta"
      >
        Return Home
      </Link>
    </div>
  )
}