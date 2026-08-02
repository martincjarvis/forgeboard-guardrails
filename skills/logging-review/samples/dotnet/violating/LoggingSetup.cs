using Microsoft.Extensions.Logging;

namespace LoggingSamples.Violating;

public static class LoggingSetup
{
    public static void Configure(ILoggingBuilder logging) =>
        // VIOLATION (third-party <= WARNING -- #third-party-components):
        // a third-party library's logs admitted at Information.
        logging.AddFilter("Some.ThirdParty.HttpClient", LogLevel.Information);
}
