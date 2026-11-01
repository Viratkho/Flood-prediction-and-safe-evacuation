import React, { useEffect, useRef, useState } from 'react';

interface TextClipRevealProps {
  /** The text string to animate letter-by-letter */
  text: string;
  /** HTML element wrapper tag (default 'h1') */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div' | 'strong' | 'label';
  /** Classes applied to the root element */
  className?: string;
  /** Classes applied to each word wrapper */
  wordClassName?: string;
  /** Classes applied to each individual character */
  charClassName?: string;
  /** Delay between consecutive characters in milliseconds (recommended 45-70ms) */
  charDelayMs?: number;
  /** Initial delay before the first character slides down (in milliseconds) */
  initialDelayMs?: number;
  /** Duration of the slide-down animation for each character (recommended 450-650ms) */
  durationMs?: number;
  /** If true, uses Intersection Observer to trigger when visible; if false, triggers on mount */
  animateOnView?: boolean;
}

/**
 * TextClipReveal: Premium vertical letter-by-letter slide-down text reveal.
 * 100% free, native CSS transforms, zero external animation libraries.
 *
 * Each character is enclosed in an outer clipping container (`overflow: hidden`)
 * and slides downward from `-110%` to `0%` with smooth cubic-bezier easing.
 *
 * Screen reader accessible via `sr-only` full-text fallback and `aria-hidden="true"`
 * on visual split elements. Respects `prefers-reduced-motion`.
 */
export const TextClipReveal: React.FC<TextClipRevealProps> = ({
  text,
  as: Component = 'h1',
  className = '',
  wordClassName = '',
  charClassName = '',
  charDelayMs = 55,
  initialDelayMs = 100,
  durationMs = 580,
  animateOnView = true,
}) => {
  const containerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(!animateOnView);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Detect reduced motion preference
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        setPrefersReducedMotion(true);
        setIsVisible(true);
        return;
      }
    }

    if (!animateOnView) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [animateOnView]);

  // Split text by words first to prevent awkward mid-word breaks on mobile devices
  const words = text.split(' ');
  let characterCounter = 0;

  return (
    <Component
      ref={containerRef as any}
      className={className}
      aria-label={text}
    >
      {/* Screen-reader accessible complete text (avoids reading letter by letter) */}
      <span className="sr-only">{text}</span>

      {/* Visual animated characters container */}
      <span aria-hidden="true" className="inline">
        {words.map((word, wordIndex) => {
          const chars = Array.from(word);
          const isLastWord = wordIndex === words.length - 1;

          const wordContent = (
            <span
              key={wordIndex}
              className={`inline-block whitespace-nowrap ${wordClassName}`}
            >
              {chars.map((char, charIndex) => {
                const charStaggerDelay = prefersReducedMotion
                  ? 0
                  : isVisible
                  ? initialDelayMs + characterCounter * charDelayMs
                  : 0;

                characterCounter++;

                return (
                  <span
                    key={charIndex}
                    className="inline-block overflow-hidden align-bottom"
                    style={{
                      lineHeight: '1.05',
                      paddingBottom: '0.06em',
                    }}
                  >
                    <span
                      className={`inline-block char-clip-inner ${charClassName}`}
                      style={{
                        transform: prefersReducedMotion || isVisible ? 'translateY(0%)' : 'translateY(-115%)',
                        animationName: prefersReducedMotion ? 'none' : isVisible ? 'charSlideDown' : 'none',
                        animationDuration: `${durationMs}ms`,
                        animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
                        animationDelay: `${charStaggerDelay}ms`,
                        animationFillMode: 'forwards',
                        willChange: 'transform',
                      }}
                    >
                      {char}
                    </span>
                  </span>
                );
              })}

              {/* Natural word spacing */}
              {!isLastWord && (
                <span className="inline-block">&nbsp;</span>
              )}
            </span>
          );

          return wordContent;
        })}
      </span>
    </Component>
  );
};
