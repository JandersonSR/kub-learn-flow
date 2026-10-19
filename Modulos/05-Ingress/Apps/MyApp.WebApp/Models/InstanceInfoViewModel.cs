namespace MyApp.WebApp.Models;

public class InstanceInfoViewModel
{
    public string? InstanceId { get; set; }
    public string? Hostname { get; set; }
    public DateTime? StartupTime { get; set; }
    public string? Uptime { get; set; }
    public string? ErrorMessage { get; set; }
    public bool HasError => !string.IsNullOrEmpty(ErrorMessage);
}

