import { useEffect, useRef } from 'react'

const LINES = [
  ['分享', '应该', '更短，'],
  ['收件', '应该', '更安静。'],
] as const

const TAGLINE = '分享应该更短，收件应该更安静。'

const LINES_WITH_INDEX = LINES.map((line, lineIndex) => ({
  key: lineIndex,
  words: line.map((word, wordIndex) => ({
    word,
    index:
      LINES.slice(0, lineIndex).reduce(
        (total, previousLine) => total + previousLine.length,
        0,
      ) + wordIndex,
  })),
}))

export function TaglineReveal() {
  const sectionRef = useRef<HTMLElement>(null)
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    const node = sectionRef.current
    const words = wordRefs.current.filter(
      (word): word is HTMLSpanElement => word !== null,
    )
    if (!node || words.length === 0) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      words.forEach((word) => {
        word.dataset.active = 'true'
      })
      return
    }

    let frame = 0

    const update = () => {
      frame = 0
      const rect = node.getBoundingClientRect()
      const viewport = window.innerHeight
      const start = viewport * 0.9
      const end = viewport * 0.5
      const distance = Math.max(1, start - end)
      const progress = Math.min(1, Math.max(0, (start - rect.top) / distance))
      const activeCount = Math.min(
        words.length,
        Math.ceil(progress * words.length),
      )

      words.forEach((word, index) => {
        if (index < activeCount) word.dataset.active = 'true'
      })
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return (
    <section
      ref={sectionRef}
      aria-label="Shortly 的核心主张"
      className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24 lg:px-8"
    >
      <p className="max-w-[680px] text-4xl font-semibold text-kumo-strong md:text-5xl lg:text-6xl">
        <span className="sr-only">{TAGLINE}</span>
        <span aria-hidden="true">
          {LINES_WITH_INDEX.map((line) => (
            <span key={line.key} className="block">
              {line.words.map((word) => (
                <span
                  key={`${line.key}-${word.index}`}
                  ref={(element) => {
                    wordRefs.current[word.index] = element
                  }}
                  data-active="false"
                  className="tagline-word"
                >
                  {word.word}
                </span>
              ))}
            </span>
          ))}
        </span>
      </p>
    </section>
  )
}
