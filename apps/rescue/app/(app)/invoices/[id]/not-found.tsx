import { ButtonLink, Card } from "@/components/ui";

export default function InvoiceNotFound() {
  return (
    <Card className="mx-auto mt-10 grid max-w-md justify-items-center gap-3 p-8 text-center">
      <h1 className="text-lg font-semibold">Invoice not found</h1>
      <p className="text-sm text-mute">It may have been removed, or it belongs to another client.</p>
      <ButtonLink href="/invoices" variant="secondary">
        Back to invoices
      </ButtonLink>
    </Card>
  );
}
