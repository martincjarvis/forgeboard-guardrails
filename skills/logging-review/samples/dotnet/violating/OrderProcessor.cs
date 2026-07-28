using Microsoft.Extensions.Logging;

namespace LoggingSamples.Violating;

public sealed record Order(string Id, string CustomerEmail);

public sealed class OrderProcessor
{
    private readonly ILogger<OrderProcessor> _logger;

    public OrderProcessor(ILogger<OrderProcessor> logger) => _logger = logger;

    // Single INFO record, so the logging test reaches (and trips on) the PII assertion.
    public void ConfirmOrder(Order order) =>
        // VIOLATION (PII at INFO -- #pii-rule): the customer email is in the audit message.
        _logger.LogInformation("Order confirmed {OrderId} for {Email}", order.Id, order.CustomerEmail);

    public void QueueOrder(Order order)
    {
        // VIOLATION (CA2254 -- #per-stack-realization): interpolated, non-constant template.
        _logger.LogInformation($"Order {order.Id} queued");
        // VIOLATION (no static logging -- #logging-via-an-injected-abstraction): Console.
        System.Console.WriteLine($"Order {order.Id} processed");
    }

    public void Retry(Order order, int attempt) =>
        // VIOLATION (compensated error -> WARN, logged at ERROR -- #level-mapping).
        _logger.LogError("Retry {Attempt} for order {OrderId}", attempt, order.Id);

    public void HandleGlobally(System.Exception ex) =>
        // VIOLATION (globally-handled -> ERROR, logged at WARN -- #level-mapping).
        _logger.LogWarning(ex, "Unhandled exception in request pipeline");

    public void ReportThroughput(int count, long ms) =>
        // VIOLATION (metrics >> logs -- #metrics-over-log-messages): a log used as a metric.
        _logger.LogInformation("Processed {Count} orders in {Ms}ms", count, ms);
}
