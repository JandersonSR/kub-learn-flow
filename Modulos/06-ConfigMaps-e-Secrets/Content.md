# ConfigMaps e Secrets: configuração sem mexer no código

**O que você vai aprender:** como configurar aplicações **"do jeito certo"** no Kubernetes. Sem hardcode (valor escrito direto no código) e sem rebuild de imagem (gerar a imagem Docker de novo a cada mudança). Para isso, usamos dois recursos:

- **ConfigMap**: um "quadro de avisos" com configurações não sensíveis (ex.: um percentual, uma URL pública).
- **Secret**: um "envelope lacrado" para dados sensíveis (ex.: senhas, tokens).

Vamos aplicar isso em um cenário real: um **desconto configurável** na API e a **URL da API** entregue ao WebApp por um Secret.

**Entregável:**
- `MyApp.WebApi` aplicando um desconto fixo (%) vindo de um ConfigMap. O valor é nullable (pode estar vazio): sem ele, o desconto é 0%.
- `MyApp.WebApp` recebendo a URL da API via Secret, sem alterar o código-fonte.

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

1. **ConfigMap** - configuração não sensível, separada da imagem.
2. **Secret** - dados sensíveis, codificados em base64. Base64 é só uma forma de "embaralhar" o texto em letras e números; qualquer um desfaz. **Não é criptografia!**
3. **Injeção via variável de ambiente** - variável de ambiente é um par "nome = valor" que o programa lê ao iniciar. Usamos `envFrom` / `configMapRef` (traz tudo de um ConfigMap) e `valueFrom` / `secretKeyRef` (traz uma chave específica de um Secret).
4. **Nullable config** - o que acontece quando a chave não existe: a aplicação usa um valor padrão (o chamado fallback, ou "plano B").
5. **Hot-reload depende de como você consome o ConfigMap/Secret** - hot-reload é a aplicação pegar o valor novo sozinha, sem reiniciar. Via variável de ambiente, isso não acontece: é preciso reiniciar os Pods.
6. **Boas práticas** - o que colocar em ConfigMap e o que colocar em Secret.

---

## 1) ConfigMap vs Secret

**Por que isso importa:** escolher o recurso errado pode expor uma senha. Entenda bem a diferença antes de seguir.

O etcd, citado na tabela, é o "banco de dados" interno onde o Kubernetes guarda tudo.

| Característica | ConfigMap | Secret |
|---|---|---|
| **Uso** | Configuração não sensível (URLs, flags, percentuais) | Dados sensíveis (senhas, tokens, connection strings) |
| **Armazenamento** | Texto plano no etcd | Base64 no etcd (⚠️ **não é criptografia**, é apenas encoding) |
| **Exibição via `kubectl get -o yaml`** | Valor visível | Valor visível em base64 (fácil de decodificar) |
| **Injeção** | Env var, volume (arquivo) | Env var, volume (arquivo) |
| **Auto-reload no Pod** | Depende de como é consumido: via variável de ambiente ❌ não atualiza sozinho; via volume montado, o arquivo é atualizado, mas a aplicação precisa reler/observar | Mesmo comportamento do ConfigMap |

⚠️ **Importante:** Secret **não é** criptografia. É só uma forma organizada de separar dados sensíveis. Ele tem controles de acesso (RBAC, as regras de "quem pode ver o quê" no cluster) e integrações (ex: Azure Key Vault, Sealed Secrets) feitas *apenas* para esse tipo de recurso.

Em produção, combine Secret com RBAC. Se possível, ative também a criptografia em repouso no cluster (encryption at rest do etcd, ou seja, os dados ficam cifrados no disco) ou use um cofre externo.

---

## 2) Alterações no código

### 2.1) MyApp.WebApi — desconto configurável (ConfigMap)

A API agora lê um valor de configuração **nullable** chamado `Discount:Percentage`. No Kubernetes, ele chega como a variável de ambiente `Discount__Percentage`.

O `__` (dois sublinhados) é a convenção do .NET para representar `:` em nomes de variáveis de ambiente.

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
- `GetValue<decimal?>(...)` retorna `null` (vazio) se a chave não existir. Aí o `?? 0m` entra e garante 0% de desconto.
- A resposta agora traz `OriginalPrice`, `DiscountPercentage` e `FinalPrice`. Assim, dá para ver o efeito do ConfigMap.
- ⚠️ Esse valor é lido **uma única vez, quando a aplicação inicia**. Mudar o ConfigMap **não** atualiza o Pod que já está rodando. É preciso reiniciar o Pod (veremos isso na seção 6).

### 2.2) MyApp.WebApp — URL da API via Secret

O `MyApp.WebApp` **já** lia a URL da API via `IConfiguration` desde o módulo **Ingress**. O `IConfiguration` é o "leitor de configurações" do .NET: ele junta valores de arquivos e de variáveis de ambiente num lugar só.

```csharp
builder.Services.AddHttpClient("WebApi", client =>
{
    var apiUrl = builder.Configuration["ApiSettings:WebApiUrl"] ?? "http://localhost:5000";
    client.BaseAddress = new Uri(apiUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
});
```

**Nenhuma mudança de código foi necessária!** Esse é o poder do padrão de configuração do .NET. A mesma chave `ApiSettings:WebApiUrl` pode vir de dois lugares:

- do `appsettings.json` (quando você roda na sua máquina);
- de uma variável de ambiente `ApiSettings__WebApiUrl`, vinda de um `Secret` (no cluster).

Tudo isso sem recompilar nada.

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

E `Views/Home/Index.cshtml` agora mostra, quando há desconto: o preço original riscado, o percentual de desconto e o preço final.

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
cd Modulos/06-ConfigMaps-e-Secrets/Apps/MyApp.WebApi

docker build -t your-docker-hub-account/myapp-webapi:5.0 .
docker push your-docker-hub-account/myapp-webapi:5.0
```

### 3.2) MyApp.WebApp v3.0

```bash
cd Modulos/06-ConfigMaps-e-Secrets/Apps/MyApp.WebApp

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
  name: config-lab
  labels:
    name: config-lab
    purpose: configmap-secret-demo
```

```bash
cd Modulos/06-ConfigMaps-e-Secrets

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
  namespace: config-lab
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
kubectl get configmap myapp-webapi-config -n config-lab -o yaml
```

Repare que o valor `"10"` aparece **em texto plano** (legível por qualquer um). Por isso, ConfigMap não deve guardar segredos.

---

## 6) Secret (URL da API para o WebApp)

### secret.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-webapp-secret
  namespace: config-lab
  labels:
    app: myapp-webapp
type: Opaque
stringData:
  ApiSettings__WebApiUrl: "http://myapp-webapi-service.config-lab.svc.cluster.local"
```

```bash
kubectl apply -f secret.yaml
```

**Alternativa imperativa** (criar direto pelo comando, sem YAML). É útil para segredos que não devem ficar salvos no Git:

```bash
kubectl create secret generic myapp-webapp-secret \
  --namespace=config-lab \
  --from-literal=ApiSettings__WebApiUrl="http://myapp-webapi-service.config-lab.svc.cluster.local"
```

**Verificar (o valor aparece em base64, não em texto plano):**

```bash
kubectl get secret myapp-webapp-secret -n config-lab -o yaml
```

**Decodificar manualmente (para provar que não é criptografia):**

```bash
kubectl get secret myapp-webapp-secret -n config-lab -o jsonpath='{.data.ApiSettings__WebApiUrl}' | base64 --decode
```

🔎 Qualquer pessoa que consiga ler o Secret consegue decodificá-lo em segundos. Por isso, um RBAC restritivo é essencial: `kubectl get secrets` só para quem realmente precisa.

---

## 7) Deployments e Services

**Por que isso importa:** é aqui que ConfigMap e Secret são "ligados" aos Pods. Sem essa ligação, a aplicação não enxerga os valores.

### deployment.yaml (API) — injeta o ConfigMap via `envFrom`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapi
  namespace: config-lab
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

`envFrom.configMapRef` injeta **todas** as chaves do ConfigMap como variáveis de ambiente. Neste caso, só existe uma: `Discount__Percentage`.

### deployment-webapp.yaml (Web) — injeta o Secret via `secretKeyRef`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapp
  namespace: config-lab
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

`valueFrom.secretKeyRef` injeta **apenas a chave escolhida**, numa variável de ambiente específica. É diferente do `envFrom`, que traz tudo de uma vez.

### service-webapi-clusterip.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi-service
  namespace: config-lab
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
  namespace: config-lab
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
kubectl get pods -n config-lab
kubectl get deployments -n config-lab
kubectl get svc -n config-lab
```

Esperado: 3 réplicas de `myapp-webapi` e 2 de `myapp-webapp`, todas `Running`.

---

## 8) Testando via port-forward

Para manter o foco em ConfigMap/Secret, vamos acessar as aplicações com `kubectl port-forward` (sem Ingress). O port-forward cria um "túnel" temporário: uma porta da sua máquina passa a apontar para o Service no cluster.

### 8.1) WebApp (frontend)

```bash
kubectl port-forward svc/myapp-webapp-service 8081:80 -n config-lab
```

Acesse: http://localhost:8081

Clique em **"Listar Produtos"**. Os produtos devem aparecer com o preço original riscado, o selo `-10%` e o preço final.

### 8.2) WebApi (direto)

Em outro terminal:

```bash
kubectl port-forward svc/myapp-webapi-service 8080:80 -n config-lab
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

**Por que isso importa:** muita gente muda o ConfigMap e estranha que "nada aconteceu". Esta seção mostra o motivo.

Injetamos o ConfigMap **como variável de ambiente** (`envFrom`). Nesse formato, o valor só é lido quando a aplicação inicia. Vamos provar que **alterar o ConfigMap não afeta Pods que já estão rodando**.

> 💡 Se o ConfigMap fosse montado como **volume** (aparecendo como um arquivo dentro do container), o `kubelet` (o agente do Kubernetes em cada máquina) atualizaria o arquivo sozinho. Mas a aplicação ainda precisaria reler esse arquivo para perceber a mudança. Isso fica para um próximo módulo.

### 9.1) Atualizar o desconto para 20%

```bash
kubectl patch configmap myapp-webapi-config -n config-lab --type merge -p '{"data":{"Discount__Percentage":"20"}}'
```

```bash
curl -s http://localhost:8080/api/products | jq '.[0]'
```

☝️ O desconto ainda aparece como **10%**. O Pod que está rodando não percebeu a mudança.

### 9.2) Reiniciar os Pods para aplicar a mudança

```bash
kubectl rollout restart deployment/myapp-webapi -n config-lab
kubectl rollout status deployment/myapp-webapi -n config-lab
```

O `rollout restart` troca os Pods antigos por novos, um "reinício controlado" que já lê os valores atualizados.

⚠️ **Importante:** o `kubectl port-forward` fica preso ao Pod que existia quando o comando começou. Como o `rollout restart` substitui os Pods, o túnel antigo cai. Refaça o port-forward antes de testar de novo:

```bash
kubectl port-forward svc/myapp-webapi-service 8080:80 -n config-lab
```

```bash
curl -s http://localhost:8080/api/products | jq '.[0]'
```

✅ Agora o desconto aparece como **20%**.

**Lição:** com configuração via variável de ambiente, qualquer mudança em ConfigMap/Secret só vale depois de um `rollout restart` (ou de um novo deploy). Usar como volume é outro caminho, com outros detalhes e limitações (ex: `subPath` também não atualiza sozinho). Isso fica para um próximo módulo.

---

## 10) Nullable: removendo a chave (fallback para 0%)

```bash
kubectl patch configmap myapp-webapi-config -n config-lab --type json -p '[{"op":"remove","path":"/data/Discount__Percentage"}]'
kubectl rollout restart deployment/myapp-webapi -n config-lab
kubectl rollout status deployment/myapp-webapi -n config-lab
```

O port-forward caiu de novo com o restart. Refaça-o antes de testar:

```bash
kubectl port-forward svc/myapp-webapi-service 8080:80 -n config-lab
```

```bash
curl -s http://localhost:8080/api/products | jq '.[0]'
```

✅ Sem a chave `Discount__Percentage`, o `GetValue<decimal?>` retorna `null`. Aí o `?? 0m` entra em ação e `discountPercentage` vira **0**. Isso confirma o comportamento nullable que queríamos.

**Restaurar o desconto original:**

```bash
kubectl apply -f configmap.yaml
kubectl rollout restart deployment/myapp-webapi -n config-lab
```

---

## 11) Script de teste automatizado

O arquivo `test-configmap-secret.sh` faz sozinho os passos acima: port-forward, aplicar 20%, restart, remover a chave, restart e inspecionar o Secret.

```bash
cd Modulos/06-ConfigMaps-e-Secrets
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

**Por que isso importa:** colocar um dado sensível no lugar errado é um dos vazamentos mais comuns.

| Vai em ConfigMap | Vai em Secret |
|---|---|
| Feature flags | Senhas / connection strings |
| Percentuais, limites, timeouts | Tokens / API keys |
| URLs de serviços internos não sensíveis | Certificados TLS |
| Nomes de ambiente (`Production`, `Staging`) | Chaves de criptografia |

**Regra prática:** se o valor vazar em um log ou num `kubectl describe` e isso causar um problema de segurança, ele vai em um Secret. O ideal é usar também um cofre externo, como o Azure Key Vault.

---

## 14) Limpeza

### Deletar recursos específicos

```bash
kubectl delete -f all-in-one.yaml
```

### Deletar namespace (remove tudo)

```bash
kubectl delete namespace config-lab
```

### Verificar limpeza

```bash
kubectl get all -n config-lab
kubectl get configmap,secret -n config-lab
```

---

## Recapitulando

- **ConfigMap**: configuração não sensível, texto plano, injetada via `envFrom`/`configMapRef`.
- **Secret**: dados sensíveis, base64 (não criptografado por padrão), injetado via `valueFrom`/`secretKeyRef`.
- Quando injetados como variável de ambiente (como fizemos aqui), ConfigMap e Secret **não têm hot-reload**. É preciso um `kubectl rollout restart` para o Pod pegar o novo valor. Via volume o comportamento é diferente, mas isso fica para outro módulo.
- Config **nullable** no .NET (`decimal?`) garante um padrão seguro (0% de desconto) quando a chave não existe.
- O `MyApp.WebApp` não precisou de nenhuma mudança de código para receber a URL da API via Secret. Só o `MyApp.WebApi` ganhou lógica nova (o cálculo do desconto).

**Próximos passos:** Health Checks avançados, Recursos (`requests`/`limits`) e Autoscaling (HPA) — deixando o cluster pronto para lidar com carga variável de forma resiliente.
