export const INVOICE_REQUIRED = ["external_ref", "counterparty_name", "kind", "amount", "currency", "issued_at"] as const;
export const INVOICE_OPTIONAL = ["due_at", "entity_name", "document_ref"] as const;
