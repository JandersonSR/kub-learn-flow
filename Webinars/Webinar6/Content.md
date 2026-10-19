# Live 6 — ConfigMaps e Secrets

Objetivo da live: entender **como configurar aplicações "do jeito certo"** no Kubernetes, sem hardcode e sem rebuild de imagem, usando **ConfigMap** (configuração não sensível) e **Secret** (dados sensíveis). Vamos aplicar isso em um cenário real: um **desconto configurável** na API e a **URL da API** injetada via Secret no WebApp.

**Entregável:** `MyApp.WebApi` aplicando um desconto fixo (%) vindo de um ConfigMap (nullable — sem o valor, desconto é 0%), e `MyApp.WebApp` recebendo a URL da API via Secret, sem alterar o código-fonte.

---

## Pré-requisitos

✅ **Cluster Minikube ativo:**

```bash
minikube status
```

Se estiver parado:

```bash
minikube start --driver=docker
```

Verificar:

```bash
kubectl get nodes
```

Esperado: 1 node com status `Ready`.

✅ **Docker Hub Account** (login com `docker login`).

✅ **`jq` instalado** (opcional, só para formatar a saída JSON dos testes):

✅ **macOS**

```bash
brew install jq
```

✅ **Linux**

Ubuntu / Debian:

```bash
sudo apt update
sudo apt install -y jq
```

Fedora / RHEL:

```bash
sudo dnf install -y jq
```

Arch Linux:

```bash
sudo pacman -S jq
```

✅ **Windows**

Com Winget:

```powershell
winget install jqlang.jq
```

Com Chocolatey:

```powershell
choco install jq
```

Com Scoop:

```powershell
scoop install jq
```

Para validar a instalação:

```bash
jq --version
```

---

## O que vamos aprender

1. **ConfigMap** - configuração não sensível, desacoplada da imagem
2. **Secret** - dados sensíveis, codificados em base64 (não criptografados por padrão!)
3. **Injeção via variável de ambiente** - `envFrom` / `configMapRef` e `valueFrom` / `secretKeyRef`
4. **Nullable config** - comportamento padrão quando a chave não existe
5. **Hot-reload depende de como você consome o ConfigMap/Secret** - via variável de ambiente, é preciso reiniciar os Pods
6. **Boas práticas** - o que colocar em ConfigMap vs Secret

---

## 1) ConfigMap vs Secret

| Característica | ConfigMap | Secret |
|---|---|---|
| **Uso** | Configuração não sensível (URLs, flags, percentuais) | Dados sensíveis (senhas, tokens, connection strings) |
| **Armazenamento** | Texto plano no etcd | Base64 no etcd (⚠️ **não é criptografia**, é apenas encoding) |
| **Exibição via `kubectl get -o yaml`** | Valor visível | Valor visível em base64 (fácil de decodificar) |
| **Injeção** | Env var, volume (arquivo) | Env var, volume (arquivo) |
| **Auto-reload no Pod** | Depende de como é consumido: via variável de ambiente ❌ não atualiza sozinho; via volume montado, o arquivo é atualizado, mas a aplicação precisa reler/observar | Mesmo comportamento do ConfigMap |

⚠️ **Importante:** Secret **não é** criptografia. É só uma convenção/organização para dados sensíveis, com controles de acesso (RBAC) e integrações (ex: Azure Key Vault, Sealed Secrets) que fazem sentido *apenas* para esse tipo de recurso. Em produção, combine com RBAC e, se possível, criptografia em repouso no cluster (encryption at rest do etcd) ou um cofre externo.

---

## 2) Alterações no código

### 2.1) MyApp.WebApi — desconto configurável (ConfigMap)

A API agora lê um valor **nullable** de configuração, `Discount:Percentage`, que via Kubernetes chega como variável de ambiente `Discount__Percentage` (o `__` é a convenção do .NET para representar `:` em nomes de variáveis de ambiente).

Trecho relevante de `Apps/MyApp.WebApi/Program.cs`:

```csharp
// Discount configuration (from ConfigMap via env var "Discount__Percentage").
// Nullable: when not set, no discount is applied (0%).
var discountPercentage = builder.Configuration.GetValue<decimal?>("Discount:Percentage") ?? 0m;

ProductWithDiscount ApplyDiscount(Product product)
{
    var finalPrice = Math.Round(product.Price * (1 - discountPercentage / 100m), 2);
    return new ProductWithDiscount(product.Id, product.Name, product.Description, product.Price, discountPercentage, finalPrice);
}

app.MapGet("/products", () => Results.Ok(products.Select(ApplyDiscount)))
    .WithName("GetProducts");

app.MapGet("/products/{id}", (int id) =>
    {
        var product = products.FirstOrDefault(p => p.Id == id);
        return product is not null ? Results.Ok(ApplyDiscount(product)) : Results.NotFound();
    })
    .WithName("GetProductById");

record ProductWithDiscount(int Id, string Name, string Description, decimal OriginalPrice, decimal DiscountPercentage, decimal FinalPrice);
```

**Pontos-chave:**
- `GetValue<decimal?>(...)` retorna `null` se a chave não existir → `?? 0m` garante 0% de desconto por padrão.
- A resposta agora traz `OriginalPrice`, `DiscountPercentage` e `FinalPrice`, deixando visível o efeito do ConfigMap.
- ⚠️ Esse valor é lido **uma única vez, na inicialização do processo**. Mudar o ConfigMap **não** atualiza o Pod em execução — é necessário reiniciar o Pod (veremos isso na seção 6).

### 2.2) MyApp.WebApp — URL da API via Secret

O `MyApp.WebApp` **já** lia a URL da API via `IConfiguration`, desde o Webinar 5:

```csharp
builder.Services.AddHttpClient("WebApi", client =>
{
    var apiUrl = builder.Configuration["ApiSettings:WebApiUrl"] ?? "http://localhost:5000";
    client.BaseAddress = new Uri(apiUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
});
```

**Nenhuma mudança de código foi necessária!** Isso é o poder do padrão de configuração do .NET: a mesma chave `ApiSettings:WebApiUrl` pode vir do `appsettings.json` (dev local) ou de uma variável de ambiente `ApiSettings__WebApiUrl` injetada a partir de um `Secret` (no cluster) — sem recompilar nada.

### 2.3) Frontend — exibindo desconto

`Models/ProductViewModel.cs` foi atualizado para refletir o novo formato de resposta da API:

```csharp
public class ProductViewModel
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public decimal OriginalPrice { get; set; }
    public decimal DiscountPercentage { get; set; }
    public decimal FinalPrice { get; set; }
}
```

E `Views/Home/Index.cshtml` agora mostra o preço original riscado + o percentual de desconto + o preço final, quando há desconto:

```html
@if (product.DiscountPercentage > 0)
{
    <span class="text-muted text-decoration-line-through me-2">$ @product.OriginalPrice.ToString("N2")</span>
    <span class="badge bg-danger me-2">-@product.DiscountPercentage.ToString("N0")%</span>
    <span class="fs-5 fw-bold text-success">$ @product.FinalPrice.ToString("N2")</span>
}
else
{
    <span class="fs-5 fw-bold text-success">$ @product.FinalPrice.ToString("N2")</span>
}
```

---

## 3) Build e push das novas imagens

### 3.1) MyApp.WebApi v5.0

```bash
cd Webinars/Webinar6/Apps/MyApp.WebApi

docker build -t your-docker-hub-account/myapp-webapi:5.0 .
docker push your-docker-hub-account/myapp-webapi:5.0
```

### 3.2) MyApp.WebApp v3.0

```bash
cd Webinars/Webinar6/Apps/MyApp.WebApp

docker build -t your-docker-hub-account/myapp-webapp:3.0 .
docker push your-docker-hub-account/myapp-webapp:3.0
```

**Exemplo real:**

```bash
docker build -t tallesvaliatti/myapp-webapi:5.0 .
docker push tallesvaliatti/myapp-webapi:5.0
```

```bash
docker build -t tallesvaliatti/myapp-webapp:3.0 .
docker push tallesvaliatti/myapp-webapp:3.0
```

---

## 4) Namespace

### namespace.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: webinar6
  labels:
    name: webinar6
    purpose: configmap-secret-demo
```

```bash
cd Webinars/Webinar6

kubectl apply -f namespace.yaml
```

---

## 5) ConfigMap (desconto da API)

### configmap.yaml

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-webapi-config
  namespace: webinar6
  labels:
    app: myapp-webapi
data:
  # Fixed discount applied to all products (percentage, e.g. "10" = 10%).
  # This key is nullable from the app's point of view: if the key (or the
  # whole ConfigMap) is removed, MyApp.WebApi falls back to 0% discount.
  Discount__Percentage: "10"
```

```bash
kubectl apply -f configmap.yaml
```

**Verificar:**

```bash
kubectl get configmap myapp-webapi-config -n webinar6 -o yaml
```

Repare que o valor `"10"` aparece **em texto plano** — isso reforça por que ConfigMap não deve guardar segredos.

---

## 6) Secret (URL da API para o WebApp)

### secret.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-webapp-secret
  namespace: webinar6
  labels:
    app: myapp-webapp
type: Opaque
stringData:
  ApiSettings__WebApiUrl: "http://myapp-webapi-service.webinar6.svc.cluster.local"
```

```bash
kubectl apply -f secret.yaml
```

**Alternativa imperativa** (sem YAML, útil para segredos que não devem ficar versionados):

```bash
kubectl create secret generic myapp-webapp-secret \
  --namespace=webinar6 \
  --from-literal=ApiSettings__WebApiUrl="http://myapp-webapi-service.webinar6.svc.cluster.local"
```

**Verificar (o valor aparece em base64, não em texto plano):**

```bash
kubectl get secret myapp-webapp-secret -n webinar6 -o yaml
```

**Decodificar manualmente (para provar que não é criptografia):**

```bash
kubectl get secret myapp-webapp-secret -n webinar6 -o jsonpath='{.data.ApiSettings__WebApiUrl}' | base64 --decode
```

🔎 Qualquer pessoa com acesso de leitura ao Secret consegue decodificá-lo em segundos. Por isso, RBAC restritivo (`kubectl get secrets` só para quem precisa) é essencial.

---

## 7) Deployments e Services

### deployment.yaml (API) — injeta o ConfigMap via `envFrom`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapi
  namespace: webinar6
  labels:
    app: myapp-webapi
    tier: backend
spec:
  replicas: 3
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: myapp-webapi
  template:
    metadata:
      labels:
        app: myapp-webapi
        tier: backend
    spec:
      containers:
      - name: webapi
        image: tallesvaliatti/myapp-webapi:5.0
        ports:
        - containerPort: 8080
          name: http
        env:
        - name: ASPNETCORE_URLS
          value: "http://+:8080"
        envFrom:
        - configMapRef:
            name: myapp-webapi-config
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

`envFrom.configMapRef` injeta **todas** as chaves do ConfigMap como variáveis de ambiente — nesse caso, apenas `Discount__Percentage`.

### deployment-webapp.yaml (Web) — injeta o Secret via `secretKeyRef`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapp
  namespace: webinar6
  labels:
    app: myapp-webapp
    tier: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp-webapp
  template:
    metadata:
      labels:
        app: myapp-webapp
        tier: frontend
    spec:
      containers:
      - name: webapp
        image: tallesvaliatti/myapp-webapp:3.0
        env:
        - name: ApiSettings__WebApiUrl
          valueFrom:
            secretKeyRef:
              name: myapp-webapp-secret
              key: ApiSettings__WebApiUrl
        ports:
        - containerPort: 8080
          name: http
        resources:
          requests:
            memory: "32Mi"
            cpu: "25m"
          limits:
            memory: "64Mi"
            cpu: "50m"
```

`valueFrom.secretKeyRef` injeta **apenas a chave escolhida** como uma variável de ambiente específica — diferente do `envFrom`, que traz tudo de uma vez.

### service-webapi-clusterip.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi-service
  namespace: webinar6
  labels:
    app: myapp-webapi
spec:
  type: ClusterIP
  selector:
    app: myapp-webapi
  ports:
  - name: http
    protocol: TCP
    port: 80
    targetPort: 8080
```

### service-webapp-clusterip.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapp-service
  namespace: webinar6
  labels:
    app: myapp-webapp
spec:
  type: ClusterIP
  selector:
    app: myapp-webapp
  ports:
  - name: http
    protocol: TCP
    port: 80
    targetPort: 8080
```

**Aplicar tudo:**

```bash
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service-webapi-clusterip.yaml
kubectl apply -f deployment-webapp.yaml
kubectl apply -f service-webapp-clusterip.yaml
```

**Verificar:**

```bash
kubectl get pods -n webinar6
kubectl get deployments -n webinar6
kubectl get svc -n webinar6
```

Esperado: 3 réplicas de `myapp-webapi` e 2 de `myapp-webapp`, todas `Running`.

---

## 8) Testando via port-forward

Para manter o foco em ConfigMap/Secret, vamos acessar as aplicações com `kubectl port-forward` (sem Ingress).

### 8.1) WebApp (frontend)

```bash
kubectl port-forward svc/myapp-webapp-service 8081:80 -n webinar6
```

Acesse: http://localhost:8081

Clique em **"Listar Produtos"** — os produtos devem aparecer com o preço original riscado, o badge `-10%` e o preço final.

### 8.2) WebApi (direto)

Em outro terminal:

```bash
kubectl port-forward svc/myapp-webapi-service 8080:80 -n webinar6
```

```bash
curl -s http://localhost:8080/api/products | jq .
```

**Saída esperada (resumida):**

```json
[
  {
    "id": 1,
    "name": "Laptop",
    "description": "High-performance laptop",
    "originalPrice": 1299.99,
    "discountPercentage": 10,
    "finalPrice": 1169.99
  }
]
```

---

## 9) Hot-reload via variável de ambiente? Mudando o desconto

Já injetamos o ConfigMap **como variável de ambiente** (`envFrom`). Nesse formato, o valor é lido apenas na inicialização do processo, então vamos provar que **alterar o ConfigMap não afeta Pods já em execução**.

> 💡 Se o ConfigMap fosse montado como **volume** (arquivo), o `kubelet` atualizaria o arquivo automaticamente — mas a aplicação ainda precisaria observar/reler esse arquivo para perceber a mudança. Isso fica para uma live futura.

### 9.1) Atualizar o desconto para 20%

```bash
kubectl patch configmap myapp-webapi-config -n webinar6 --type merge -p '{"data":{"Discount__Percentage":"20"}}'
```

```bash
curl -s http://localhost:8080/api/products | jq '.[0]'
```

☝️ O desconto ainda aparece como **10%** — o Pod em execução não percebeu a mudança.

### 9.2) Reiniciar os Pods para aplicar a mudança

```bash
kubectl rollout restart deployment/myapp-webapi -n webinar6
kubectl rollout status deployment/myapp-webapi -n webinar6
```

⚠️ **Importante:** `kubectl port-forward` fica preso ao Pod que existia quando o comando foi iniciado. Como o `rollout restart` substitui os Pods, o túnel antigo cai — refaça o port-forward antes de testar novamente:

```bash
kubectl port-forward svc/myapp-webapi-service 8080:80 -n webinar6
```

```bash
curl -s http://localhost:8080/api/products | jq '.[0]'
```

✅ Agora o desconto aparece como **20%**.

**Lição:** para configuração via variável de ambiente, qualquer mudança em ConfigMap/Secret exige um `rollout restart` (ou um novo deploy) para ser aplicada. Consumir como volume monta um caminho diferente, com outros detalhes e limitações (ex: `subPath` também não atualiza sozinho) — fica para uma live futura.

---

## 10) Nullable: removendo a chave (fallback para 0%)

```bash
kubectl patch configmap myapp-webapi-config -n webinar6 --type json -p '[{"op":"remove","path":"/data/Discount__Percentage"}]'
kubectl rollout restart deployment/myapp-webapi -n webinar6
kubectl rollout status deployment/myapp-webapi -n webinar6
```

O port-forward caiu de novo com o restart — refaça-o antes de testar:

```bash
kubectl port-forward svc/myapp-webapi-service 8080:80 -n webinar6
```

```bash
curl -s http://localhost:8080/api/products | jq '.[0]'
```

✅ Sem a chave `Discount__Percentage`, `GetValue<decimal?>` retorna `null`, o `?? 0m` entra em ação, e `discountPercentage` vira **0** — confirmando o comportamento nullable pedido no requisito.

**Restaurar o desconto original:**

```bash
kubectl apply -f configmap.yaml
kubectl rollout restart deployment/myapp-webapi -n webinar6
```

---

## 11) Script de teste automatizado

O arquivo `test-configmap-secret.sh` automatiza os passos acima (port-forward, aplicar 20%, restart, remover chave, restart, inspecionar Secret):

```bash
cd Webinars/Webinar6
./test-configmap-secret.sh
```

---

## 12) All-in-One YAML

Para aplicar tudo de uma vez (namespace, ConfigMap, Secret, Deployments, Services):

```bash
kubectl apply -f all-in-one.yaml
```

---

## 13) Boas práticas: o que vai em ConfigMap vs Secret

| Vai em ConfigMap | Vai em Secret |
|---|---|
| Feature flags | Senhas / connection strings |
| Percentuais, limites, timeouts | Tokens / API keys |
| URLs de serviços internos não sensíveis | Certificados TLS |
| Nomes de ambiente (`Production`, `Staging`) | Chaves de criptografia |

**Regra prática:** se o vazamento do valor em um log ou em um `kubectl describe` causaria um incidente de segurança, ele pertence a um Secret (e, idealmente, a um cofre externo como Azure Key Vault).

---

## 14) Limpeza

### Deletar recursos específicos

```bash
kubectl delete -f all-in-one.yaml
```

### Deletar namespace (remove tudo)

```bash
kubectl delete namespace webinar6
```

### Verificar limpeza

```bash
kubectl get all -n webinar6
kubectl get configmap,secret -n webinar6
```

---

## Recapitulando

- **ConfigMap**: configuração não sensível, texto plano, injetada via `envFrom`/`configMapRef`.
- **Secret**: dados sensíveis, base64 (não criptografado por padrão), injetado via `valueFrom`/`secretKeyRef`.
- Quando injetados como variável de ambiente (como fizemos aqui), ConfigMap e Secret **não são hot-reload** — é preciso `kubectl rollout restart` para o Pod pegar o novo valor. Consumidos via volume o comportamento é diferente, mas isso fica para outra live.
- Config **nullable** no .NET (`decimal?`) permite comportamento padrão seguro (0% de desconto) quando a chave não existe.
- O `MyApp.WebApp` não precisou de nenhuma mudança de código para passar a receber a URL da API via Secret — só o `MyApp.WebApi` ganhou lógica nova (o cálculo do desconto).

**Próxima live:** Health Checks avançados, Recursos (`requests`/`limits`) e Autoscaling (HPA) — deixando o cluster pronto para lidar com carga variável de forma resiliente.
