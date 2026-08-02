using Microsoft.Extensions.Logging.Testing; // FakeLogger types (package: Microsoft.Extensions.Diagnostics.Testing)
using Microsoft.Extensions.Logging;
using Xunit;

namespace LoggingSamples.Conformant;

public class OrderProcessorLoggingTests
{
    [Fact]
    public void ConfirmOrder_emits_info_audit_without_PII_and_no_unexpected_warnings()
    {
        var collector = new FakeLogCollector();          // test-scoped capture
        var logger = new FakeLogger<OrderProcessor>(collector);
        var sut = new OrderProcessor(logger);

        sut.ConfirmOrder(new Order("ORD-42", "jane@example.com"));

        var records = collector.GetSnapshot();

        // Exactly one INFO audit event (ConfirmOrder emits a single INFO).
        var audit = Assert.Single(records, r => r.Level == LogLevel.Information);
        // PII assertion FIRST -- this is the assertion the red run trips on
        // (the violating ConfirmOrder puts the email in the message).
        Assert.DoesNotContain("jane@example.com", audit.Message);
        // Identity + structured fields: correct event name, OrderId present.
        Assert.Equal("OrderConfirmed", audit.Id.Name);
        Assert.Contains(audit.StructuredState!,
            kv => kv.Key == "OrderId" && kv.Value == "ORD-42");
        // Negative: no unexpected Warning/Error during the run.
        Assert.DoesNotContain(records, r => r.Level >= LogLevel.Warning);
    }
}
