# Live 5 — Ingress

Objetivo da live: dominar **Ingress** no Kubernetes, aprendendo a **expor aplicações com URLs amigáveis**, **configurar roteamento por path e host**, **habilitar o Ingress Controller** no Minikube e construir uma arquitetura com **roteamento inteligente** (web + api atrás do Ingress).

**Entregável:** aplicação multi-serviço acessível via URLs amigáveis sem NodePort, usando Ingress para roteamento inteligente.

---

## Pré-requisitos

✅ **Cluster Minikube ativo:**

```bash
minikube status
```

**Importante:** Se o cluster estiver parado, inicie-o:

```bash
minikube start --driver=docker
```

Verificar que está funcionando:

```bash
kubectl get nodes
```

Esperado: 1 node com status `Ready`.

✅ **Docker Hub Account:**

Você precisará de uma conta no Docker Hub para fazer push da imagem. Se não tiver:
- Criar conta em: https://hub.docker.com
- Fazer login local: `docker login`

✅ **Ingress Controller (será habilitado durante a live)**

---

## O que vamos aprender

1. **O que é Ingress** - roteamento de tráfego HTTP/HTTPS
2. **Ingress Controller** - NGINX Ingress no Minikube
3. **Roteamento por Path** - `/` e `/api`
4. **Roteamento por Host** - `myapp.local` e `api.myapp.local`
5. **Annotations** - configurações avançadas do NGINX
6. **TLS/HTTPS** - certificados SSL (opcional)
7. **Arquitetura production-ready** - sem NodePort, só ClusterIP + Ingress
---

## 1) Entendendo Ingress no Kubernetes

### O que é Ingress?

Nas lives anteriores, usamos **NodePort** para expor aplicações externamente. Mas NodePort tem limitações:
- ❌ Portas altas (30000-32767) - não são user-friendly
- ❌ Sem roteamento inteligente (path, host, headers)
- ❌ Sem terminação SSL/TLS centralizada
- ❌ Um service = uma porta diferente

**Ingress resolve tudo isso!**

### O que é um Ingress?

**Ingress** é um recurso do Kubernetes que gerencia **acesso externo** aos serviços do cluster, tipicamente HTTP/HTTPS.

**Funcionalidades:**
- ✅ **Roteamento por path**: `/` → webapp, `/api` → api
- ✅ **Roteamento por host**: `myapp.local` → webapp, `api.myapp.local` → api
- ✅ **Terminação SSL/TLS**: HTTPS centralizado
- ✅ **URL amigáveis**: sem portas estranhas
- ✅ **Load balancing**: distribuição automática
- ✅ **Name-based virtual hosting**: múltiplos hosts no mesmo IP

### Ingress vs Service

| Recurso | Função | Exemplo |
|---------|--------|---------|
| **Service** | Expõe pods dentro ou fora do cluster | ClusterIP, NodePort, LoadBalancer |
| **Ingress** | Roteamento HTTP(S) inteligente | Path-based, Host-based routing |

**Analogia:**
- **Service** = Servidor web simples (Apache, IIS)
- **Ingress** = Reverse proxy inteligente (NGINX, Traefik, HAProxy)

### Componentes do Ingress

1. **Ingress Resource** (YAML): Regras de roteamento
2. **Ingress Controller**: Implementação que executa as regras (NGINX, Traefik, HAProxy, etc.)
3. **Services**: Backend que recebe o tráfego

**Fluxo:**

```
Internet → Ingress Controller (NGINX) → Ingress Rules → Services → Pods
```

---

## 2) Habilitando Ingress Controller no Minikube

O Minikube vem com um **addon de Ingress** (NGINX Ingress Controller) que pode ser habilitado facilmente.

### 2.1) Habilitar addon de Ingress

```bash
minikube addons enable ingress
```

**Saída esperada:**

```
🌟  The 'ingress' addon is enabled
```

### 2.2) Verificar o Ingress Controller

O addon cria recursos no namespace `ingress-nginx`:

```bash
kubectl get pods -n ingress-nginx
```

**Saída esperada:**

```
NAME                                        READY   STATUS      RESTARTS   AGE
ingress-nginx-admission-create-xxx          0/1     Completed   0          2m
ingress-nginx-admission-patch-xxx           0/1     Completed   0          2m
ingress-nginx-controller-xxxxxxxxxx-xxxxx   1/1     Running     0          2m
```

**Verificar serviços:**

```bash
kubectl get svc -n ingress-nginx
```

**Saída esperada:**

```
NAME                                 TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)
ingress-nginx-controller             NodePort    10.96.x.x       <none>        80:xxxxx/TCP,443:xxxxx/TCP
ingress-nginx-controller-admission   ClusterIP   10.96.x.x       <none>        443/TCP
```

✅ **Ingress Controller rodando!**

### 2.3) Verificar versão do Ingress Controller

```bash
kubectl exec -n ingress-nginx deploy/ingress-nginx-controller -- /nginx-ingress-controller --version
```

---

## 3) Namespace e aplicações base

### namespace.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: webinar5
  labels:
    name: webinar5
    purpose: ingress-demo
```

Aplicar:

```bash
cd Webinars/Webinar5

kubectl apply -f namespace.yaml
```

---

## 3.1) Preparando a API v4.0 com UsePathBase

Para esta webinar, vamos usar uma **nova versão da API (v4.0)** que inclui uma configuração importante: **`app.UsePathBase("/api")`**.

### O que mudou?

Nas versões anteriores (v3.0), a API respondia diretamente em endpoints como:
- `/health`
- `/products`
- `/instance`

Com **UsePathBase**, a API agora **espera** que as requisições venham com o prefixo `/api`:
- `/api/health`
- `/api/products`
- `/api/instance`

### Por que usar UsePathBase?

**Vantagens:**
1. ✅ **Consistência**: A aplicação conhece seu próprio path base
2. ✅ **Portabilidade**: Funciona em qualquer ambiente (local, Docker, Kubernetes)
3. ✅ **Simplicidade no Ingress**: Não precisa de rewrite complexo com regex
4. ✅ **Links corretos**: A API gera links corretos automaticamente (ex: OpenAPI)
5. ✅ **Melhor prática**: A aplicação é responsável pelo seu próprio roteamento

### Código da API v4.0

No arquivo `Apps/MyApp.WebApi/Program.cs`:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();

var app = builder.Build();

// Configure path base for API
app.UsePathBase("/api");

app.MapOpenApi();

// Instance information (generated at startup)
var instanceId = Guid.NewGuid().ToString("N")[..8];
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
```

**Observação importante:** A linha `app.UsePathBase("/api");` é o que faz toda a diferença!

### Build e Push da imagem v4.0

Agora você precisa construir e fazer push da nova versão:

```bash
cd Webinars/Webinar5/Apps/MyApp.WebApi

# Build da imagem v4.0
docker build -t your-docker-hub-account/myapp-webapi:4.0 .

# Login no Docker Hub (se ainda não fez)
docker login

# Push para Docker Hub
docker push your-docker-hub-account/myapp-webapi:4.0
```

**Exemplo real:**

```bash
docker build -t tallesvaliatti/myapp-webapi:4.0 .
docker push tallesvaliatti/myapp-webapi:4.0
```
---

## 3.1) Preparando o WebApp v2.0

Nesta seção vamos preparar uma nova versão do *WebApp* (**v2.0**) que assume que a API já está servindo seus endpoints com o prefixo `/api` (como na API v4.0 com `UsePathBase("/api")`). Na prática, isso significa que todas as chamadas HTTP do frontend/server-side do WebApp precisam incluir o segmento `api/` no início dos caminhos.

O que mudamos no código do WebApp (exemplos):

- Antes (v1.x) — chamando endpoints na raiz da API:
  - var response = await httpClient.GetAsync("products");
  - var response = await httpClient.GetAsync("instance");

- Agora (v2.0) — incluindo o prefixo `/api` nas chamadas:
  - var response = await httpClient.GetAsync("api/products");
  - var response = await httpClient.GetAsync("api/instance");

Observação: se o `HttpClient` estiver configurado com um `BaseAddress` apontando para `http://myapp-webapi-service.webinar5.svc.cluster.local/`, então usar `GetAsync("api/products")` resulta na requisição final `http://myapp-webapi-service.webinar5.svc.cluster.local/api/products`.

Exemplo mínimo (trecho típico do controller):

```csharp
var httpClient = httpClientFactory.CreateClient("WebApi");
var response = await httpClient.GetAsync("api/products");
// ...
var response2 = await httpClient.GetAsync("api/instance");
```

No repositório, atualize e publique a imagem do WebApp v2.0:

```bash
cd Webinars/Webinar5/Apps/MyApp.WebApp
# Build da imagem v2.0
docker build -t your-docker-hub-account/myapp-webapp:2.0 .
# Push para o Docker Hub
docker push your-docker-hub-account/myapp-webapp:2.0
```
---

## 4) Deployments e Services (ClusterIP apenas!)

Agora vamos usar **apenas ClusterIP** para os Services, pois o Ingress Controller fará o acesso externo.

**Importante:** Os deployments abaixo usam a **versão 4.0** da API que inclui `UsePathBase("/api")`.

### deployment.yaml (API)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapi
  namespace: webinar5
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
        image: your-docker-hub-account/myapp-webapi:4.0
        ports:
        - containerPort: 8080
          name: http
        env:
        - name: ASPNETCORE_URLS
          value: "http://+:8080"
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

### service-clusterip.yaml (API)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi-service
  namespace: webinar5
  labels:
    app: myapp-webapi
spec:
  type: ClusterIP  # Apenas interno - Ingress faz acesso externo
  selector:
    app: myapp-webapi
  ports:
  - name: http
    protocol: TCP
    port: 80
    targetPort: 8080
```

### deployment-webapp.yaml (Web)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapp
  namespace: webinar5
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
        image: your-docker-hub-account/myapp-webapp:2.0
        env:
        - name: ApiSettings__WebApiUrl
          value: "http://myapp-webapi-service.webinar5.svc.cluster.local"
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

### service-webapp-clusterip.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapp-service
  namespace: webinar5
  labels:
    app: myapp-webapp
spec:
  type: ClusterIP  # Internal only - Ingress handles external access
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
kubectl apply -f deployment.yaml
kubectl apply -f service-webapi-clusterip.yaml
kubectl apply -f deployment-webapp.yaml
kubectl apply -f service-webapp-clusterip.yaml
```

**Nota:** O arquivo `deployment-webapp.yaml` já contém desde o início a variável de ambiente `ApiSettings__WebApiUrl` apontando para `http://myapp-webapi-service.webinar5.svc.cluster.local`. Não é necessário adicioná-la manualmente durante a live.

---

## 5) Roteamento por Path (Path-based Routing)

Vamos criar um Ingress que roteia por **path**:
- `/` → WebApp
- `/api` → API

### ingress-path.yaml

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress-path
  namespace: webinar5
  annotations:
    nginx.ingress.kubernetes.io/use-regex: "true"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          # Frontend: tudo que NÃO começar com /api
          - path: /(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: myapp-webapp-service
                port:
                  number: 80
          
          # Backend: /api/<algo> -> /api/<algo> no service da API (sem rewrite)
          - path: /api(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: myapp-webapi-service
                port:
                  number: 80
```

**Explicação dos campos:**

- **ingressClassName**: Define qual controller usar (`nginx`)
- **annotations**:
  - `use-regex: "true"` = Habilita suporte a expressões regulares nos paths
  - **Sem `rewrite-target`** porque a API v4.0 usa `UsePathBase("/api")` e já espera receber o path completo
- **rules**: Lista de regras de roteamento
- **http.paths**: Caminhos e backends
- **path**: URL path com regex
  - `/(.*)` = Captura qualquer path (para o frontend)
  - `/api(/|$)(.*)` = Captura `/api` e tudo depois
- **pathType**: `ImplementationSpecific` = Permite regex (específico do NGINX)
- **backend.service**: Service de destino e porta

**Como funciona COM UsePathBase:**
- Requisição: `http://example.com/api/products`
- Regex match: `/api(/|$)(.*)` casa com o path
- Ingress envia: `GET http://myapp-webapi-service/api/products` (path completo!)
- API recebe: `/api/products`
- `UsePathBase("/api")` reconhece o base path
- Endpoint `/products` é executado

✅ **Mais simples que rewrite! A aplicação é responsável pelo seu próprio path.**

**Aplicar:**

```bash
kubectl apply -f ingress-path.yaml
```

**Verificar:**

```bash
kubectl get ingress -n webinar5

# Ver detalhes
kubectl describe ingress myapp-ingress-path -n webinar5
```

**Saída esperada:**

```
NAME                  CLASS   HOSTS   ADDRESS        PORTS   AGE
myapp-ingress-path    nginx   *       192.168.49.2   80      10s
```

### 5.1) Testar roteamento por path

Obter IP do Minikube:

```bash
minikube ip
```

Testar no terminal:

```bash
MINIKUBE_IP=$(minikube ip)

# WebApp (root path)
curl http://${MINIKUBE_IP}/

# API health
curl http://${MINIKUBE_IP}/api/health

# API instance
curl http://${MINIKUBE_IP}/api/instance

# API products
curl http://${MINIKUBE_IP}/api/products
```

**📝 Nota para macOS + Docker driver:**

No macOS com Docker driver, o IP do Minikube pode não estar acessível diretamente. Neste caso, use o serviço do Ingress Controller:

```bash
# Obter URL do Ingress Controller
minikube service -n ingress-nginx ingress-nginx-controller --url

# Testar endpoints
curl -i $INGRESS_URL/
curl -i $INGRESS_URL/api/health
curl -i $INGRESS_URL/api/instance
curl -i $INGRESS_URL/api/products
```

Isso cria um túnel automático para o Ingress Controller, permitindo acessar os serviços sem configurar /etc/hosts.

🎉 **Funcionou! Roteamento por path!**

---

## 6) Roteamento por Host (Host-based Routing)

Agora vamos criar roteamento por **hostname** (virtual hosting):
- `myapp.local` → WebApp
- `api.myapp.local` → API

### ingress-host.yaml

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress-host
  namespace: webinar5
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp-webapp-service
            port:
              number: 80
  - host: api.myapp.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp-webapi-service
            port:
              number: 80
```

**Diferenças:**

- Agora temos **host** definido em cada rule
- Cada host aponta para um service diferente
- Sem rewrite, pois cada serviço fica na raiz do seu domínio

**Aplicar:**

Primeiro, vamos deletar o ingress anterior:

```bash
kubectl delete ingress myapp-ingress-path -n webinar5
```

Aplicar o novo:

```bash
kubectl apply -f ingress-host.yaml
```

**Verificar:**

```bash
kubectl get ingress -n webinar5 -o wide
```

### 6.2) Configurar acesso para testes

Para testar o roteamento por host, precisamos mapear os hostnames (`myapp.local`, `api.myapp.local`) para um endereço IP. Existem **duas abordagens** dependendo do seu ambiente:

---

#### **Opção 1: Usar IP do Minikube diretamente (Linux/Windows ou Hypervisor VM)**

✅ **Recomendado** - Porta fixa, mais previsível para demos

**Passo 1:** Obter o IP do Minikube

```bash
minikube ip
```

Exemplo de saída: `192.168.49.2`

**Passo 2:** Adicionar ao `/etc/hosts`

```bash
MINIKUBE_IP=$(minikube ip)
echo "${MINIKUBE_IP} myapp.local api.myapp.local" | sudo tee -a /etc/hosts
```

Ou editar manualmente:

```bash
sudo nano /etc/hosts
```

Adicionar linha:

```
192.168.49.2 myapp.local api.myapp.local
```

Salvar (`Ctrl+O`, `Enter`, `Ctrl+X`).

**Passo 3:** Testar (porta 80, padrão HTTP)

```bash
# WebApp
curl http://myapp.local/

# API
curl http://api.myapp.local/health
curl http://api.myapp.local/products
```

**Navegador:**
- http://myapp.local
- http://api.myapp.local/api/products

✅ **Vantagens:**
- Porta fixa (80)
- URLs limpas sem porta
- Mais profissional para demos
- Funciona de forma consistente

❌ **Limitação:**
- No macOS com Docker driver, o IP do Minikube geralmente **não é acessível** do host

---

#### **Opção 2: Usar túnel do Minikube com porta dinâmica (macOS + Docker driver)**

✅ **Necessário** quando o IP do Minikube não está acessível (macOS + Docker)

**Passo 1:** Criar túnel e obter URL com porta

```bash
minikube service -n ingress-nginx ingress-nginx-controller --url
```

Exemplo de saída: `http://127.0.0.1:65113`

**Passo 2:** Mapear hostnames para `127.0.0.1` no `/etc/hosts`

```bash
echo "127.0.0.1 myapp.local api.myapp.local" | sudo tee -a /etc/hosts
```

Ou editar manualmente:

```bash
sudo nano /etc/hosts
```

Adicionar linha:

```
127.0.0.1 myapp.local api.myapp.local
```

**Passo 3:** Manter o túnel aberto em um terminal separado

```bash
# Em um terminal dedicado (mantenha aberto)
minikube service -n ingress-nginx ingress-nginx-controller
```

Saída:
```
|---------------|--------------------------|-------------|---------------------------|
|   NAMESPACE   |           NAME           | TARGET PORT |            URL            |
|---------------|--------------------------|-------------|---------------------------|
| ingress-nginx | ingress-nginx-controller | http/80     | http://127.0.0.1:65113    |
|               |                          | https/443   | http://127.0.0.1:65114    |
|---------------|--------------------------|-------------|---------------------------|
🏃  Starting tunnel for service ingress-nginx-controller.
```

**⚠️ Importante:** Deixe este terminal aberto! Se fechar, o túnel para e o acesso não funciona.

**Passo 4:** Testar com a **porta retornada** (use a porta do passo 1)

Se a porta for `65113`:

```bash
# WebApp
curl http://myapp.local:65113/

# API
curl http://api.myapp.local:65113/api/health
curl http://api.myapp.local:65113/api/products
```

**Navegador:**
- http://myapp.local:65113/
- http://api.myapp.local:65113/api/products

✅ **Vantagens:**
- Funciona em macOS com Docker driver
- Não precisa de configuração de rede adicional
- Túnel seguro via SSH

❌ **Desvantagens:**
- Porta muda a cada execução (dinâmica: 65113, 52841, etc.)
- Precisa manter terminal aberto
- URLs precisam incluir a porta
- Menos previsível para demos

---

### 6.3) Testar roteamento por host

Escolha os comandos de acordo com a opção que você configurou acima.

#### Se usou **Opção 1** (IP direto):

**Terminal:**

```bash
# WebApp
curl http://myapp.local/

# API
curl http://api.myapp.local/api/health
curl http://api.myapp.local/api/instance
curl http://api.myapp.local/api/products
```

**Navegador:**
- http://myapp.local
- http://api.myapp.local/products

---

#### Se usou **Opção 2** (túnel - porta dinâmica):

**Terminal:**

Substitua `65113` pela porta que o túnel retornou:

```bash
# WebApp
curl http://myapp.local:65113/

# API
curl http://api.myapp.local:65113/api/health
curl http://api.myapp.local:65113/api/instance
curl http://api.myapp.local:65113/api/products
```

**Navegador:**
- http://myapp.local:65113/
- http://api.myapp.local:65113/products

**💡 Dica:** Você também pode testar com `curl` usando header `Host` sem configurar `/etc/hosts`:

```bash
INGRESS_URL=$(minikube service -n ingress-nginx ingress-nginx-controller --url)
curl -H "Host: myapp.local" $INGRESS_URL/
curl -H "Host: api.myapp.local" $INGRESS_URL/health
```

Mas para navegador, é melhor configurar `/etc/hosts` com `127.0.0.1`.

---

## 7) Combinando Path + Host (Arquitetura Recomendada)

A arquitetura mais comum é **um domínio com paths diferentes**:
- `myapp.local/` → WebApp
- `myapp.local/api/*` → API

### ingress-combined.yaml

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  namespace: webinar5
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp-webapp-service
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: myapp-webapi-service
            port:
              number: 80
```

**Entendendo a simplicidade com UsePathBase:**

Com a **API v4.0** usando `app.UsePathBase("/api")`, o Ingress fica **muito mais simples**:

- **path**: `/api` - Path simples, sem regex!
- **pathType**: `Prefix` - Casa com tudo que começa com `/api`
- **Sem annotations de rewrite** - A API já espera receber `/api/*`
- **Resultado**: 
  - Cliente faz: `GET http://myapp.local/api/products`
  - Ingress envia: `GET http://myapp-webapi-service/api/products`
  - API recebe: `/api/products` (exatamente como esperado!)

**Comparação com v3.0 (sem UsePathBase):**

| Aspecto | v3.0 (SEM UsePathBase) | v4.0 (COM UsePathBase) |
|---------|------------------------|------------------------|
| **Path no Ingress** | `/api(/\|$)(.*)` (regex) | `/api` (simples) |
| **Annotations** | `rewrite-target: /$2` | Nenhuma! |
| **Complexidade** | Alta (regex) | Baixa (prefix) |
| **Manutenção** | Difícil | Fácil |
| **Responsabilidade** | Ingress transforma path | API conhece seu path |

✅ **UsePathBase é a melhor prática!**

**Aplicar:**

```bash
kubectl delete ingress myapp-ingress-host -n webinar5 2>/dev/null || true
kubectl apply -f ingress-combined.yaml
```

**Verificar:**

```bash
kubectl get ingress -n webinar5
kubectl describe ingress myapp-ingress -n webinar5
```

---

### 7.1) Configurar acesso para testes

Assim como na seção 6, você tem **duas opções** para configurar o acesso. A diferença é que agora usamos apenas **um hostname** (`myapp.local`) com **paths diferentes** (`/` e `/api`).

---

#### **Opção 1: Usar IP do Minikube diretamente (Linux/Windows ou Hypervisor VM)**

✅ **Recomendado** - Porta fixa (80), URLs limpas, ideal para demos

**Passo 1:** Verificar se já tem `/etc/hosts` configurado da seção 6

```bash
cat /etc/hosts | grep myapp.local
```

Se já tiver `myapp.local` apontando para o IP do Minikube, pode pular para os testes.

**Passo 2:** Se não tiver, adicionar agora

```bash
MINIKUBE_IP=$(minikube ip)
echo "${MINIKUBE_IP} myapp.local" | sudo tee -a /etc/hosts
```

**Nota:** Não precisa adicionar `api.myapp.local` desta vez, pois usamos apenas `myapp.local` com paths diferentes.

---

#### **Opção 2: Usar túnel do Minikube com porta dinâmica (macOS + Docker driver)**

✅ **Necessário** quando o IP do Minikube não está acessível

**Passo 1:** Verificar se já tem `/etc/hosts` configurado da seção 6

```bash
cat /etc/hosts | grep "127.0.0.1 myapp.local"
```

Se já tiver, pode usar o mesmo túnel.

**Passo 2:** Se não tiver, adicionar agora

```bash
echo "127.0.0.1 myapp.local" | sudo tee -a /etc/hosts
```

**Passo 3:** Verificar se o túnel ainda está aberto

Se você fechou o túnel da seção 6, precisa abrir novamente:

```bash
# Em um terminal dedicado (mantenha aberto)
minikube service -n ingress-nginx ingress-nginx-controller
```

Anote a porta retornada (ex: `65113`).

**⚠️ Importante:** Use a **mesma porta** que o túnel está fornecendo.

---

### 7.2) Testar arquitetura combinada

Escolha os comandos de acordo com a opção que você configurou.

#### **Se usou Opção 1** (IP direto):

**Terminal:**

```bash
# WebApp (root path)
curl http://myapp.local/

# API (via /api path)
curl http://myapp.local/api/health
curl http://myapp.local/api/instance
curl http://myapp.local/api/products
```

**Navegador:**
- http://myapp.local
- http://myapp.local/api/products

**O que observar:**
- ✅ `/` vai para o WebApp
- ✅ `/api/*` vai para a API
- ✅ O path `/api` é **removido** antes de chegar no backend (rewrite)
- ✅ URLs limpas sem porta

---

#### **Se usou Opção 2** (túnel - porta dinâmica):

**Terminal:**

Substitua `65113` pela porta que o túnel retornou:

```bash
# WebApp (root path)
curl http://myapp.local:65113/

# API (via /api path)
curl http://myapp.local:65113/api/health
curl http://myapp.local:65113/api/instance
curl http://myapp.local:65113/api/products
```

**Navegador:**
- http://myapp.local:65113/
- http://myapp.local:65113/api/products

**O que observar:**
- ✅ `/` vai para o WebApp
- ✅ `/api/*` vai para a API
- ⚠️ Precisa incluir a porta na URL

**💡 Alternativa com curl (sem /etc/hosts):**

Se preferir testar sem configurar `/etc/hosts`, use o header `Host`:

```bash
INGRESS_URL=$(minikube service -n ingress-nginx ingress-nginx-controller --url)

curl -H "Host: myapp.local" $INGRESS_URL/
curl -H "Host: api.myapp.local" $INGRESS_URL/health
```

---

## 8) Annotations importantes do NGINX Ingress

O NGINX Ingress suporta várias annotations para configurações avançadas:

### Rewrite e Redirect

**⚠️ Nota importante:** Com `UsePathBase` na aplicação (API v4.0), você **não precisa** de `rewrite-target`. 
A aplicação já conhece seu path base!

```yaml
annotations:
  # Rewrite do path (NÃO necessário com UsePathBase!)
  # nginx.ingress.kubernetes.io/rewrite-target: /$2
  
  # Redirect permanente
  nginx.ingress.kubernetes.io/permanent-redirect: https://novo-site.com
  
  # Redirect temporário  
  nginx.ingress.kubernetes.io/temporal-redirect: https://manutencao.com
```

### CORS (Cross-Origin Resource Sharing)

```yaml
annotations:
  nginx.ingress.kubernetes.io/enable-cors: "true"
  nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, PUT, DELETE, OPTIONS"
  nginx.ingress.kubernetes.io/cors-allow-origin: "*"
  nginx.ingress.kubernetes.io/cors-allow-credentials: "true"
```

### Rate Limiting

```yaml
annotations:
  nginx.ingress.kubernetes.io/limit-rps: "10"  # 10 requisições por segundo
  nginx.ingress.kubernetes.io/limit-connections: "5"  # 5 conexões simultâneas
```

### SSL/TLS

```yaml
annotations:
  nginx.ingress.kubernetes.io/ssl-redirect: "true"  # Force HTTPS
  nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
```

### Timeout

```yaml
annotations:
  nginx.ingress.kubernetes.io/proxy-connect-timeout: "60"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
  nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
```

### Sticky Sessions (Session Affinity)

```yaml
annotations:
  nginx.ingress.kubernetes.io/affinity: "cookie"
  nginx.ingress.kubernetes.io/session-cookie-name: "route"
  nginx.ingress.kubernetes.io/session-cookie-max-age: "172800"  # 2 dias
```

---

## 9) All-in-One YAML

Para facilitar o deploy completo:

### all-in-one.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: webinar5
  labels:
    name: webinar5
    purpose: ingress-demo

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapi
  namespace: webinar5
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
        image: your-docker-hub-account/myapp-webapi:4.0
        ports:
        - containerPort: 8080
          name: http
        env:
        - name: ASPNETCORE_URLS
          value: "http://+:8080"
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

---
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi-service
  namespace: webinar5
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

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapp
  namespace: webinar5
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
        image: your-docker-hub-account/myapp-webapp:1.0
        # Variável já presente no manifesto: WebApp consome internamente a API do cluster
        env:
        - name: ApiSettings__WebApiUrl
          value: "http://myapp-webapi-service.webinar5.svc.cluster.local"
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

---
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapp-service
  namespace: webinar5
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

---
# Ingress with host-based routing (simple, no rewrite needed with UsePathBase)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  namespace: webinar5
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: myapp-webapp-service
            port:
              number: 80
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: myapp-webapi-service
            port:
              number: 80
```

**Deploy completo:**

```bash
# ANTES: trocar '<docker-hub-account>' pelo seu usuário do Docker Hub
# IMPORTANTE: Usar a versão 4.0 da API que tem UsePathBase("/api")

# Habilitar Ingress
minikube addons enable ingress

# Deploy tudo
kubectl apply -f all-in-one.yaml

# Aguardar pods ficarem prontos
kubectl get pods -n webinar5 -w

# Verificar Ingress
kubectl get ingress -n webinar5

# Adicionar ao /etc/hosts
MINIKUBE_IP=$(minikube ip)
echo "${MINIKUBE_IP} myapp.local" | sudo tee -a /etc/hosts

# Testar
curl http://myapp.local/
curl http://myapp.local/api/health
```

---

## 10) Comandos úteis de Ingress

### Listar Ingress

```bash
# Todos os namespaces
kubectl get ingress --all-namespaces

# Namespace específico
kubectl get ingress -n webinar5

# Com mais detalhes
kubectl get ingress -n webinar5 -o wide
```

### Descrever Ingress

```bash
kubectl describe ingress myapp-ingress -n webinar5
```

**O que observar:**

- **Rules**: Regras de roteamento (host, path, backend)
- **Events**: Eventos do Ingress Controller
- **Backend**: Services e portas de destino

### Ver logs do Ingress Controller

```bash
# Logs do NGINX Ingress Controller
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx -f
```

### Editar Ingress em runtime

```bash
kubectl edit ingress myapp-ingress -n webinar5
```

### Testar com curl (forçar Host header)

```bash
MINIKUBE_IP=$(minikube ip)

# Forçar host header
curl -H "Host: myapp.local" http://${MINIKUBE_IP}/
curl -H "Host: myapp.local" http://${MINIKUBE_IP}/api/health
```

### Debug de Ingress

```bash
# Ver configuração NGINX gerada
kubectl exec -n ingress-nginx deploy/ingress-nginx-controller -- cat /etc/nginx/nginx.conf

# Ver upstreams configurados
kubectl exec -n ingress-nginx deploy/ingress-nginx-controller -- cat /etc/nginx/nginx.conf | grep upstream -A 5
```

---

## 11) Diferenças: NodePort vs Ingress

| Característica | NodePort | Ingress |
|----------------|----------|---------|
| **URL** | IP:30000-32767 | dominio.com/path |
| **Roteamento** | Um service = uma porta | Múltiplos services no mesmo IP/porta |
| **Path routing** | ❌ Não | ✅ Sim |
| **Host routing** | ❌ Não | ✅ Sim |
| **SSL/TLS** | ❌ Cada service | ✅ Centralizado |
| **Load balancing** | ✅ Basic | ✅ Avançado |
| **Uso** | Dev/Teste | Produção |

### Quando usar cada um?

**NodePort:**
- ✅ Desenvolvimento local rápido
- ✅ Testes temporários
- ✅ Quando não precisa de roteamento complexo

**Ingress:**
- ✅ Produção
- ✅ Múltiplos serviços no mesmo domínio
- ✅ SSL/TLS
- ✅ Roteamento complexo (path, host, headers)
- ✅ URLs user-friendly

**Arquitetura recomendada:**

```
Internet
    ↓
Ingress Controller (NGINX)
    ↓
Ingress Rules (myapp.local, /api)
    ↓
Services (ClusterIP)
    ↓
Pods
```

---

## 12) Limpeza

### Deletar recursos específicos

```bash
kubectl delete -f all-in-one.yaml
```

### Deletar namespace (remove tudo)
    
```bash
kubectl delete namespace webinar5
```

### Remover /etc/hosts

```bash
sudo nano /etc/hosts
# Remover linha: 192.168.49.2 myapp.local api.myapp.local
```

### Desabilitar addon Ingress (opcional)

```bash
minikube addons disable ingress
```

### Verificar limpeza

```bash
kubectl get all -n webinar5
kubectl get ingress -n webinar5
```