namespace MyApp.WebApp.Models;

public class HomeViewModel
{
    public InstanceInfoViewModel? InstanceInfo { get; set; }
    public List<ProductViewModel>? Products { get; set; }
    public string? ProductsErrorMessage { get; set; }
    public bool HasProductsError => !string.IsNullOrEmpty(ProductsErrorMessage);
}

