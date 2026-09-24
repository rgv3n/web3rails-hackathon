import { Container, Section, SectionHeading } from "./ui";

const VIMEO_ID = "1229797470";

/**
 * Vimeo embed, click to play (no autoplay).
 * dnt=1: Vimeo does not set tracking cookies or collect session analytics (keeps the privacy notice true).
 */
const SRC = `https://player.vimeo.com/video/${VIMEO_ID}?${new URLSearchParams({
  badge: "0",
  autopause: "0",
  player_id: "0",
  app_id: "58479",
  dnt: "1",
}).toString()}`;

export function VideoOverview() {
  return (
    <Section id="overview">
      <Container>
        <SectionHeading
          eyebrow="Overview"
          title="Web3Rails in 100 seconds."
          lede="A short walkthrough: how stablecoin activity becomes an accounting-ready financial record."
        />
        <div className="relative mt-10 aspect-video w-full overflow-hidden rounded-lg border border-line bg-ink shadow-[0_1px_2px_rgba(15,20,24,0.04),0_12px_40px_-24px_rgba(15,20,24,0.25)]">
          <iframe
            src={SRC}
            title="Web3Rails overview: stablecoin treasury management, from onchain activity to financial records"
            loading="lazy"
            allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </Container>
    </Section>
  );
}
