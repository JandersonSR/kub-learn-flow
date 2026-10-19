var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();

// Configure path base for API
app.UsePathBase("/api");

app.MapOpenApi();

// Instance information (generated at startup)
var instanceId = Guid.NewGuid().ToString("N")[..8]; // First 8 chars of GUID
var hostname = Environment.MachineName;
var startupTime = DateTime.UtcNow;

// Static products list
var products = new[]
{
    new Product(1, "Laptop", "High-performance laptop", 1299.99m),
    new Product(2, "Smartphone", "Latest model smartphone", 899.99m),
    new Product(3, "Headphones", "Wireless noise-cancelling headphones", 249.99m),
    new Product(4, "Keyboard", "Mechanical gaming keyboard", 129.99m),
    new Product(5, "Mouse", "Ergonomic wireless mouse", 59.99m)
};

app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
    .WithName("HealthCheck");

app.MapGet("/products", () => Results.Ok(products))
    .WithName("GetProducts");

app.MapGet("/products/{id}", (int id) =>
    {
        var product = products.FirstOrDefault(p => p.Id == id);
        return product is not null ? Results.Ok(product) : Results.NotFound();
    })
    .WithName("GetProductById");

app.MapGet("/instance", () =>
    {
        var uptime = DateTime.UtcNow - startupTime;
        var instance = new InstanceInfo(
            instanceId,
            hostname,
            startupTime,
            $"{uptime.Hours:D2}:{uptime.Minutes:D2}:{uptime.Seconds:D2}"
        );
        return Results.Ok(instance);
    })
    .WithName("GetInstance");

app.Run();

record Product(int Id, string Name, string Description, decimal Price);
record InstanceInfo(string InstanceId, string Hostname, DateTime StartupTime, string Uptime);
