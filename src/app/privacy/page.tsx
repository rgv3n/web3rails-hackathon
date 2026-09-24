import type { Metadata } from "next";
import { PageShell } from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How the Web3Rails website handles personal data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PageShell eyebrow="Legal" title="Privacy notice." lede="This notice covers the web3rails.io website. Last updated 24 September 2026.">
      <h2>What this website collects</h2>
      <p>
        The website is a static informational site. It does not set advertising or analytics cookies
        and does not run third-party trackers. The homepage embeds a video hosted by Vimeo with
        Vimeo&apos;s &ldquo;do not track&rdquo; setting enabled, which stops the player from setting cookies or
        collecting session analytics; Vimeo still receives the technical data needed to stream the video. Standard server logs (IP address, user agent,
        requested URL, timestamp) may be kept by our hosting provider for security and operational
        purposes for a limited period.
      </p>
      <h2>When you contact us</h2>
      <p>
        If you email us, we keep your message and contact details to reply to you and to follow up on
        the conversation. We do not sell or share that information with third parties for marketing.
      </p>
      <h2>Product data</h2>
      <p>
        The Web3Rails product processes onchain transaction data and the financial records that
        customers connect to it. That processing is governed by the agreement signed with each
        customer, not by this website notice.
      </p>
      <h2>Your rights</h2>
      <p>
        Depending on where you live you may have rights to access, correct or delete personal data
        we hold about you. Write to{" "}
        <a href="mailto:hello@web3rails.io">hello@web3rails.io</a> and we will respond.
      </p>
    </PageShell>
  );
}
