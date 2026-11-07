import { ButtonLink, Card } from "@/components/ui";

export default function MessageNotFound() {
  return (
    <Card className="mx-auto mt-10 grid max-w-md justify-items-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">Message not found</h1>
      <p className="text-sm text-mute">It may have been removed, or it belongs to another team.</p>
      <ButtonLink href="/inbox" variant="secondary">
        Back to the inbox
      </ButtonLink>
    </Card>
  );
}
