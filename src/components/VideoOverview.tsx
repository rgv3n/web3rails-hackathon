"use client";

import { useSyncExternalStore } from "react";
import { Container, Section, SectionHeading } from "./ui";

const VIMEO_ID = "1229797470";

/**
 * Vimeo embed.
 * - dnt=1: Vimeo does not set tracking cookies or collect session analytics (keeps the privacy notice true).
 * - Autoplays muted, as provided by Web3Rails, except for visitors who ask for reduced motion.
 * - The iframe is rendered only on the client, once the reduced-motion preference is known, and lazy-loaded.
 */
function vimeoSrc(autoplay: boolean) {
  const p = new URLSearchParams({
    badge: "0",
    autopause: "0",
    player_id: "0",
    app_id: "58479",
    dnt: "1",
    autoplay: autoplay ? "1" : "0",
    muted: autoplay ? "1" : "0",
  });
  return `https://player.vimeo.com/video/${VIMEO_ID}?${p.toString()}`;
}

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

export function VideoOverview() {
  // null on the server: the iframe is only rendered in the browser, once reduced-motion is known.
  const reduce = useSyncExternalStore(subscribe, () => window.matchMedia(REDUCED).matches, () => null);
  const src = reduce === null ? null : vimeoSrc(!reduce);

  return (
    <Section id="overview">
      <Container>
        <SectionHeading
          eyebrow="Overview"
          title="Web3Rails in 100 seconds."
          lede="A short walkthrough: how stablecoin activity becomes an accounting-ready financial record."
        />
        <div className="relative mt-10 aspect-video w-full overflow-hidden rounded-lg border border-line bg-ink shadow-[0_1px_2px_rgba(15,20,24,0.04),0_12px_40px_-24px_rgba(15,20,24,0.25)]">
          {src && (
            <iframe
              src={src}
              title="Web3Rails overview: stablecoin treasury management, from onchain activity to financial records"
              loading="lazy"
              allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          )}
        </div>
      </Container>
    </Section>
  );
}
