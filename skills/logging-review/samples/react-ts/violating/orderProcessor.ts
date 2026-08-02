// Self-contained (own Logger export) so the flat scratch copy resolves without
// importing across the conformant/ directory.
export interface Logger {
  info(event: string, fields: Record<string, unknown>): void;
  warn(event: string, fields: Record<string, unknown>): void;
  error(event: string, fields: Record<string, unknown>): void;
}

export class OrderProcessor {
  constructor(private readonly logger: Logger) {}

  confirmOrder(order: { id: string; customerEmail: string }): void {
    // VIOLATION (PII at info -- #pii-rule).
    this.logger.info("order confirmed", { email: order.customerEmail });
    // VIOLATION (no static logging -- #logging-via-an-injected-abstraction): raw console.
    console.log("order processed", order.id);
  }

  retry(order: { id: string }, attempt: number): void {
    // VIOLATION (compensated error -> warn, logged at error -- #level-mapping).
    this.logger.error("retry attempt", { attempt, orderId: order.id });
  }

  handleGlobally(err: unknown): void {
    // VIOLATION (globally-handled -> error, logged at warn -- #level-mapping).
    this.logger.warn("unhandled error in middleware", { err });
  }

  reportThroughput(count: number, ms: number): void {
    // VIOLATION (metrics >> logs -- #metrics-over-log-messages): a log used as a metric.
    this.logger.info("throughput", { count, ms });
  }
}
