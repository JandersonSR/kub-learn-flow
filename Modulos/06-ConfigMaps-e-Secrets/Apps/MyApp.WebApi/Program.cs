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

// Discount configuration (from ConfigMap via env var "Discount__Percentage").
// Nullable: when not set, no discount is applied (0%).
var discountPercentage = builder.Configuration.GetValue<decimal?>("Discount:Percentage") ?? 0m;

// Static products list
var products = new[]
{
    new Product(1, "Laptop", "High-performance laptop", 1299.99m),
    new Product(2, "Smartphone", "Latest model smartphone", 899.99m),
    new Product(3, "Headphones", "Wireless noise-cancelling headphones", 249.99m),
    new Product(4, "Keyboard", "Mechanical gaming keyboard", 129.99m),
    new Product(5, "Mouse", "Ergonomic wireless mouse", 59.99m)
};

ProductWithDiscount ApplyDiscount(Product product)
{
    var finalPrice = Math.Round(product.Price * (1 - discountPercentage / 100m), 2);
    return new ProductWithDiscount(product.Id, product.Name, product.Description, product.Price, discountPercentage, finalPrice);
}

app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
    .WithName("HealthCheck");

app.MapGet("/products", () => Results.Ok(products.Select(ApplyDiscount)))
    .WithName("GetProducts");

app.MapGet("/products/{id}", (int id) =>
    {
        var product = products.FirstOrDefault(p => p.Id == id);
        return product is not null ? Results.Ok(ApplyDiscount(product)) : Results.NotFound();
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
record ProductWithDiscount(int Id, string Name, string Description, decimal OriginalPrice, decimal DiscountPercentage, decimal FinalPrice);
record InstanceInfo(string InstanceId, string Hostname, DateTime StartupTime, string Uptime);
