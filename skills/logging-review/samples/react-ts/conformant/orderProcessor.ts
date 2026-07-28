export interface Logger {
  info(event: string, fields: Record<string, unknown>): void;
  warn(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
}

export class OrderProcessor {
  constructor(private readonly logger: Logger) {}

  // Auditable event -> info, no PII: orderId only, never customerEmail.
  confirmOrder(order: { id: string; customerEmail: string }): void {
    this.logger.info("OrderConfirmed", { orderId: order.id });
  }
}
