using Microsoft.Extensions.Logging;

namespace LoggingSamples.Conformant;

public sealed record Order(string Id, string CustomerEmail);

public sealed partial class OrderProcessor
{
    private readonly ILogger<OrderProcessor> _logger;

    public OrderProcessor(ILogger<OrderProcessor> logger) => _logger = logger;

    [LoggerMessage(EventId = 1001, EventName = "OrderConfirmed",
        Level = LogLevel.Information, Message = "Order confirmed {OrderId}")]
    private partial void LogOrderConfirmed(string orderId);

    // Auditable event -> INFO, no PII: OrderId only, never CustomerEmail.
    public void ConfirmOrder(Order order) => LogOrderConfirmed(order.Id);
}
