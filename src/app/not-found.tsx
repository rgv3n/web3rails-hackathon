import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <PageShell eyebrow="404" title="This page does not exist." lede="The address may have changed, or the link was wrong.">
      <p>
        <Button href="/" arrow>
          Back to the homepage
        </Button>
      </p>
    </PageShell>
  );
}
