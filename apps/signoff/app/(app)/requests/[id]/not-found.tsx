import { ButtonLink, Card } from "@/components/ui";

export default function RequestNotFound() {
  return (
    <Card className="mx-auto mt-10 grid max-w-md justify-items-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">Request not found</h1>
      <p className="text-sm text-mute">It may have been deleted, or it belongs to someone whose requests you can&apos;t see.</p>
      <ButtonLink href="/requests" variant="secondary">
        Back to requests
      </ButtonLink>
    </Card>
  );
}
