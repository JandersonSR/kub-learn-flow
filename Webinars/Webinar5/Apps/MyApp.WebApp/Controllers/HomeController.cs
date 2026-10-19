using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using MyApp.WebApp.Models;

namespace MyApp.WebApp.Controllers;

public class HomeController(IHttpClientFactory httpClientFactory, ILogger<HomeController> logger)
    : Controller
{
    private readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public IActionResult Index()
    {
        return View(new HomeViewModel());
    }

    [HttpPost]
    public async Task<IActionResult> CallInstanceApi()
    {
        var viewModel = new HomeViewModel
        {
            InstanceInfo = new InstanceInfoViewModel()
        };
        
        try
        {
            var httpClient = httpClientFactory.CreateClient("WebApi");
            var response = await httpClient.GetAsync("api/instance");

            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                var apiData = JsonSerializer.Deserialize<InstanceInfoViewModel>(content, _jsonOptions);
                
                if (apiData != null)
                {
                    viewModel.InstanceInfo = apiData;
                }
            }
            else
            {
                viewModel.InstanceInfo.ErrorMessage = $"HTTP error! status: {response.StatusCode}";
                logger.LogError("Instance API call failed with status: {StatusCode}", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            viewModel.InstanceInfo.ErrorMessage = $"Erro ao chamar API: {ex.Message}";
            logger.LogError(ex, "Error calling Instance API");
        }

        return View("Index", viewModel);
    }

    [HttpPost]
    public async Task<IActionResult> CallProductsApi()
    {
        var viewModel = new HomeViewModel
        {
            Products = new List<ProductViewModel>()
        };
        
        try
        {
            var httpClient = httpClientFactory.CreateClient("WebApi");
            var response = await httpClient.GetAsync("api/products");

            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                var products = JsonSerializer.Deserialize<List<ProductViewModel>>(content, _jsonOptions);
                
                if (products != null)
                {
                    viewModel.Products = products;
                }
            }
            else
            {
                viewModel.ProductsErrorMessage = $"HTTP error! status: {response.StatusCode}";
                logger.LogError("Products API call failed with status: {StatusCode}", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            viewModel.ProductsErrorMessage = $"Erro ao chamar API: {ex.Message}";
            logger.LogError(ex, "Error calling Products API");
        }

        return View("Index", viewModel);
    }

    public IActionResult Privacy()
    {
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}