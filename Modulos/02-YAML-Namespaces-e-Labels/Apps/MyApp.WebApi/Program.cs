var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();
app.MapOpenApi();

// Static products list
var products = new[]
{
    new Product(1, "Laptop", "High-performance laptop", 1299.99m),
    new Product(2, "Smartphone", "Latest model smartphone", 899.99m),
    new Product(3, "Headphones", "Wireless noise-cancelling headphones", 249.99m),
    new Product(4, "Keyboard", "Mechanical gaming keyboard", 129.99m),
    new Product(5, "Mouse", "Ergonomic wireless mouse", 59.99m)
};

app.MapGet("/products", () => Results.Ok(products))
    .WithName("GetProducts");

app.MapGet("/products/{id}", (int id) =>
    {
        var product = products.FirstOrDefault(p => p.Id == id);
        return product is not null ? Results.Ok(product) : Results.NotFound();
    })
    .WithName("GetProductById");

app.Run();

record Product(int Id, string Name, string Description, decimal Price);