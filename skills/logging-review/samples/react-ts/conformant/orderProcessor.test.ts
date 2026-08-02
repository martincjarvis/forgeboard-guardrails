import { describe, it, expect, vi } from "vitest";
import { OrderProcessor, type Logger } from "./orderProcessor";

describe("OrderProcessor logging", () => {
  it("emits an info audit event with no PII and no unexpected warn/error", () => {
    const logger: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const sut = new OrderProcessor(logger);

    sut.confirmOrder({ id: "ORD-42", customerEmail: "jane@example.com" });

    // Positive: one info audit event carrying orderId, no PII.
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("OrderConfirmed", {
      orderId: "ORD-42",
    });
    expect(JSON.stringify((logger.info as any).mock.calls)).not.toContain(
      "jane@example.com",
    );

    // Negative: no unexpected warn/error during the run.
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
