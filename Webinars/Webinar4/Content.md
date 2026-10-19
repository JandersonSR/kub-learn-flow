# Live 4 — Services (ClusterIP/NodePort)

Objetivo da live: dominar **Services** no Kubernetes, aprendendo a **expor aplicações internamente** (ClusterIP), **testar resolução DNS**, **expor temporariamente com NodePort** e construir uma arquitetura **multi-serviço** (web → api).

**Entregável:** aplicação multi-serviço funcionando com comunicação entre pods via DNS interno do Kubernetes.

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

---

## O que vamos aprender

1. **O que são Services** - abstração de rede no Kubernetes
2. **ClusterIP** - serviço interno (padrão)
3. **NodePort** - acesso externo em porta alta
4. **DNS interno** - resolução automática de nomes
5. **Service Discovery** - pods encontrando outros pods
6. **Load Balancing** - distribuição automática de requisições
7. **Arquitetura multi-serviço** - web frontend chamando API backend

---

## 1) Entendendo Services no Kubernetes

### Por que precisamos de Services?

**Problema:** Pods são efêmeros! Quando um pod morre e é recriado:
- Recebe um **novo IP**
- O nome do pod pode mudar (se for de um Deployment)
- Como outros pods encontram esse pod?

**Solução:** Services!

### O que é um Service?

Um **Service** é uma abstração que define:
- Um **conjunto lógico de pods** (via selector)
- Uma **política de acesso** a esses pods
- Um **IP virtual estável** (ClusterIP) que não muda
- Um **nome DNS** para resolução interna

**Analogia:** Service é como um "balanceador de carga interno" + "registro DNS".

### Tipos de Services

| Tipo | Descrição | Uso |
|------|-----------|-----|
| **ClusterIP** | IP interno do cluster (padrão) | Comunicação entre pods |
| **NodePort** | Expõe em porta alta em cada node | Acesso externo temporário/dev |
| **LoadBalancer** | Provisiona LB externo (cloud) | Produção em cloud |
| **ExternalName** | CNAME para serviço externo | Integração externa |

Nesta live vamos focar em **ClusterIP** e **NodePort**.

---

## 2) Preparando a aplicação backend (versão 3.0)

Vamos usar a web api dentro do diretório `/Apps/MyApp.WebApi`.

### 2.1) Verificar o código

O arquivo `Apps/MyApp.WebApi/Program.cs` já está pronto com os endpoints:

```csharp
// Static products list
var products = new[]
{
    new Product(1, "Laptop", "High-performance laptop", 1299.99m),
    new Product(2, "Smartphone", "Latest model smartphone", 899.99m),
    new Product(3, "Headphones", "Wireless noise-cancelling headphones", 249.99m),
    new Product(4, "Keyboard", "Mechanical gaming keyboard", 129.99m),
    new Product(5, "Mouse", "Ergonomic wireless mouse", 59.99m)
};

// Health check endpoint - retorna status e timestamp
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }))
    .WithName("HealthCheck");

// Products endpoints
app.MapGet("/products", () => Results.Ok(products))
    .WithName("GetProducts");

app.MapGet("/products/{id}", (int id) =>
{
    var product = products.FirstOrDefault(p => p.Id == id);
    return product is not null ? Results.Ok(product) : Results.NotFound();
})
.WithName("GetProductById");

// Instance info endpoint - para visualizar load balancing
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
```

**Endpoints disponíveis:**
- `/health` - Health check (usado pelos probes do Kubernetes)
- `/products` - Lista todos os produtos
- `/products/{id}` - Busca produto por ID
- `/instance` - Informações da instância (para ver load balancing)

### 2.2) Build e push da imagem v3.0

Agora vamos construir a nova versão 3.0 com o health check completo:

```bash
cd Webinars/Webinar4/Apps/MyApp.WebApi

# Fazer login no Docker Hub (se ainda não fez)
docker login

# Build da imagem v3.0
docker build -t tallesvaliatti/myapp-webapi:3.0 .

# Push para Docker Hub
docker push tallesvaliatti/myapp-webapi:3.0
```

**O que mudou na v3.0:**
- ✅ Health check endpoint retorna timestamp

Lembre de mudar o valor `tallesvaliatti` para o seu usuário do Docker Hub!
---

## 3) Namespace dedicado

Vamos criar um namespace para organizar nossos recursos:

### namespace.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: webinar4
  labels:
    name: webinar4
    purpose: services-demo
```

Aplicar:

```bash
cd Webinars/Webinar4

kubectl apply -f namespace.yaml
```

Verificar:

```bash
kubectl get namespaces
```

---

## 4) Deployment da API (backend)

Vamos criar um Deployment com 3 réplicas da nossa API:

### deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapi
  namespace: webinar4
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
        image: <docker-hub-account>/myapp-webapi:3.0
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

**Nota:** O YAML acima usa o placeholder `<docker-hub-account>`. Substitua pelo seu usuário do Docker Hub antes de aplicar.

Aplicar:

```bash
kubectl apply -f deployment.yaml
```

Verificar os pods:

```bash
kubectl get pods -n webinar4 -o wide

# Aguardar até que todos estejam Running (1/1)
kubectl get pods -n webinar4 -w
```

---

## 5) Service ClusterIP (interno)

Agora vamos criar um **Service ClusterIP** para expor a API internamente no cluster.

### service-clusterip.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi-service
  namespace: webinar4
  labels:
    app: myapp-webapi
spec:
  type: ClusterIP  # Tipo padrão (pode omitir)
  selector:
    app: myapp-webapi  # Seleciona pods com este label
  ports:
  - name: http
    protocol: TCP
    port: 80          # Porta do Service
    targetPort: 8080  # Porta do container
```

### Entendendo o Service

**Campos importantes:**

- **selector**: Define quais pods fazem parte deste service (label `app: myapp-webapi`)
- **port**: Porta que o service expõe (80)
- **targetPort**: Porta que o container escuta (8080)
- **type: ClusterIP**: IP interno (acessível apenas dentro do cluster)

Aplicar:

```bash
kubectl apply -f service-clusterip.yaml
```

Verificar:

```bash
kubectl get svc -n webinar4

# Ver detalhes
kubectl describe svc myapp-webapi-service -n webinar4
```

**Saída esperada:**

```
NAME                    TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
myapp-webapi-service    ClusterIP   10.96.123.45    <none>        80/TCP    10s
```

**Observações:**
- **CLUSTER-IP**: IP virtual estável (não muda)
- **EXTERNAL-IP**: `<none>` porque é ClusterIP
- **PORT(S)**: `80/TCP` - porta que o service expõe

---

## 6) Testando DNS interno do Kubernetes

O Kubernetes provê **DNS automático** para Services!

### DNS Resolution

Quando você cria um Service chamado `myapp-webapi-service` no namespace `webinar4`, o Kubernetes automaticamente cria entradas DNS:

**Formatos de DNS:**

```
<service-name>                          # Mesmo namespace
<service-name>.<namespace>              # Outro namespace
<service-name>.<namespace>.svc          # Completo
<service-name>.<namespace>.svc.cluster.local  # FQDN completo
```

### 6.1) Testar DNS de dentro de um pod

Vamos criar um pod temporário para testar:

```bash
kubectl run test-pod -n webinar4 --image=busybox --rm -it --restart=Never -- sh
```

**Dentro do pod:**

```sh
# Testar resolução DNS (nome curto - mesmo namespace)
nslookup myapp-webapi-service

# Testar resolução DNS (completo)
nslookup myapp-webapi-service.webinar4.svc.cluster.local

# Testar endpoint /instance várias vezes
wget -qO- http://myapp-webapi-service/instance
wget -qO- http://myapp-webapi-service/instance
wget -qO- http://myapp-webapi-service/instance
```

**O que observar:**

1. O DNS resolve para o **ClusterIP** do service
2. As requisições HTTP funcionam
3. O endpoint `/instance` retorna **pods diferentes** a cada chamada (load balancing)

Para sair do pod:

```sh
exit
```

### 6.2) Testar com curl (pod com curl)

```bash
kubectl run curl-pod -n webinar4 --image=curlimages/curl --rm -it --restart=Never -- sh
```

**Dentro do pod:**

```sh
# Testar múltiplas requisições
curl -s http://myapp-webapi-service/instance
```

Você verá diferentes `InstanceId` - isso prova que o Service está fazendo **load balancing** entre os 3 pods! 🎉

Para sair:

```sh
exit
```

---

## 7) Service NodePort (acesso externo)

O **ClusterIP** só é acessível de dentro do cluster. Para acessar de fora (do seu laptop), precisamos de um **NodePort**.

### service-nodeport.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi-nodeport
  namespace: webinar4
  labels:
    app: myapp-webapi
spec:
  type: NodePort
  selector:
    app: myapp-webapi
  ports:
  - name: http
    protocol: TCP
    port: 80
    targetPort: 8080
    nodePort: 30080  # Porta no node (range: 30000-32767)
```

**Diferença do ClusterIP:**

- **type: NodePort**: Abre porta em cada node do cluster
- **nodePort**: Porta específica (30000-32767) - opcional, K8s pode gerar automaticamente

Aplicar:

```bash
kubectl apply -f service-nodeport.yaml
```

Verificar:

```bash
kubectl get svc -n webinar4

# Ver detalhes
kubectl describe svc myapp-webapi-nodeport -n webinar4
```

**Saída esperada:**

```
NAME                      TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
myapp-webapi-nodeport     NodePort    10.96.234.56    <none>        80:30080/TCP   10s
myapp-webapi-service      ClusterIP   10.96.123.45    <none>        80/TCP         5m
```

---

## 8) Acessando via NodePort

### 8.1) Obter URL do Minikube

O Minikube tem um comando para obter a URL do service:

```bash
minikube service myapp-webapi-nodeport -n webinar4 --url
```

**Saída esperada:**

```
http://192.168.49.2:30080
```

### 8.2) Testar no navegador

Abrir no navegador:

```
http://192.168.49.2:30080
http://192.168.49.2:30080/health
http://192.168.49.2:30080/instance
```

**📝 Nota importante para macOS:**

No macOS, o Minikube usa Docker Desktop e não expõe diretamente o IP do node (192.168.49.2). Em vez disso, o comando `minikube service --url` cria automaticamente um **túnel SSH** e retorna um endereço localhost com porta dinâmica.

**Exemplo no macOS:**

```bash
minikube service myapp-webapi-nodeport -n webinar4 --url
```

**Saída no macOS:**

```
http://127.0.0.1:60000
```

**Testando com curl:**

```bash
curl http://127.0.0.1:60000/instance
```

**Resposta:**

```json
{
  "instanceId": "90830915",
  "hostname": "myapp-webapi-b5f556567-xrwgq",
  "startupTime": "2026-01-14T14:47:44.3395329Z",
  "uptime": "00:14:10"
}
```

**O que está acontecendo?**

1. **Túnel automático**: O Minikube detecta que você está no macOS e cria um túnel SSH do localhost para o NodePort do cluster
2. **Porta dinâmica**: A porta (ex: 60000) é alocada dinamicamente e pode mudar a cada execução
3. **Localhost**: Você acessa via `127.0.0.1` em vez do IP do node
4. **Load balancing funciona**: Mesmo através do túnel, o Service distribui as requisições entre os pods

**Vantagem**: Funciona de forma transparente sem precisar configurar nada adicional!
---

### 8.3) Testar no terminal (script)

Vamos criar um script para testar o load balancing:

### test-load-balancing.sh

```bash
#!/bin/bash

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if URL is provided as parameter
if [ -z "$1" ]; then
  echo -e "${RED}Error: URL not provided!${NC}"
  echo -e "${YELLOW}Usage: $0 <url> [port]${NC}"
  echo -e "${YELLOW}Example: $0 http://127.0.0.1:60000${NC}"
  echo -e "${YELLOW}Example: $0 http://127.0.0.1:60000/instance${NC}"
  echo -e "${YELLOW}Example: $0 http://127.0.0.1 60000${NC}"
  echo -e "${YELLOW}Example: $0 http://192.168.49.2:30080${NC}"
  echo ""
  echo -e "${BLUE}Note: You can include or omit the /instance endpoint${NC}"
  echo ""
  echo -e "${BLUE}Tip: Get the URL with:${NC}"
  echo -e "  minikube service myapp-webapi-nodeport -n webinar4 --url"
  exit 1
fi

# Build service URL
if [ -z "$2" ]; then
  # URL includes port (e.g., http://192.168.49.2:30080)
  SERVICE_URL="$1"
else
  # URL and port provided separately (e.g., http://127.0.0.1 60000)
  SERVICE_URL="$1:$2"
fi

# Remove trailing slash if present
SERVICE_URL="${SERVICE_URL%/}"

# Remove /instance endpoint if user provided it (we'll add it in the loop)
SERVICE_URL="${SERVICE_URL%/instance}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Load Balancing${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}Service URL: ${SERVICE_URL}${NC}\n"

# Test /instance endpoint multiple times
echo -e "${GREEN}Testing /instance endpoint (10 requests):${NC}\n"

for i in {1..10}; do
  echo -e "${YELLOW}Request #${i}:${NC}"
  RESPONSE=$(curl -s "${SERVICE_URL}/instance")
  
  if [ -z "$RESPONSE" ]; then
    echo -e "${RED}Error: No response from server${NC}"
  else
    echo "$RESPONSE" | jq '.'
  fi
  
  echo ""
  sleep 0.5
done

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Summary:${NC}"
echo -e "You should see different InstanceId and Hostname values,"
echo -e "proving that the Service is load balancing across pods!"
echo -e "${BLUE}========================================${NC}"
```

**Como usar:**

Primeiro, obtenha a URL do service:

```bash
minikube service myapp-webapi-nodeport -n webinar4 --url
```

**📝 Nota:** O script aceita a URL **com ou sem** o endpoint `/instance`. Ele automaticamente normaliza a URL.

**Opção 1: URL completa (Linux/Windows):**

```bash
chmod +x test-load-balancing.sh
./test-load-balancing.sh http://192.168.49.2:30080
```

**Opção 2: URL e porta separadas (macOS):**

```bash
chmod +x test-load-balancing.sh
./test-load-balancing.sh http://127.0.0.1 60000
```

**Opção 3: URL com endpoint /instance incluído:**

```bash
./test-load-balancing.sh http://127.0.0.1:60125/instance
```

**Opção 4: Capturar URL automaticamente e passar para o script:**

```bash
URL=$(minikube service myapp-webapi-nodeport -n webinar4 --url)
./test-load-balancing.sh $URL
```

**O que você deve observar:**

- **InstanceId** diferente a cada requisição
- **Hostname** alternando entre os 3 pods
- Isso prova que o Service está distribuindo as requisições!

---

## 9) Arquitetura Multi-Serviço (Web → API)

Agora vamos criar uma arquitetura mais realista: um **frontend web** que chama a **API backend**.

### 9.1) Sobre o projeto MyApp.WebApp

Vamos usar o projeto **MyApp.WebApp** que já está criado. É uma aplicação **ASP.NET Core MVC** que:
- Renderiza uma interface web com Bootstrap
- Faz chamadas HTTP para a API backend
- Exibe informações de instância da API (load balancing)
- Lista produtos retornados pela API

**Estrutura do projeto:**
- `Controllers/HomeController.cs` - Controller que chama a API
- `Views/Home/Index.cshtml` - View com interface visual
- `Models/` - ViewModels para dados da API
- `appsettings.json` - Configuração da URL da API

### 9.2) Configurar URL da API

O projeto usa `appsettings.json` para configurar a URL da API backend.

### Apps/MyApp.WebApp/appsettings.json

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ApiSettings": {
    "WebApiUrl": "http://myapp-webapi-service.webinar4.svc.cluster.local"
  }
}
```

**Nota:** A URL usa o **DNS interno do Kubernetes**:
- `myapp-webapi-service` - nome do Service
- `webinar4` - namespace
- `svc.cluster.local` - sufixo DNS do Kubernetes

### 9.3) Criar Dockerfile do MyApp.WebApp

Vamos criar um Dockerfile multi-stage para build otimizado:

### Apps/MyApp.WebApp/Dockerfile

```dockerfile
# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj and restore dependencies
COPY MyApp.WebApp.csproj .
RUN dotnet restore

# Copy everything else and build
COPY . .
RUN dotnet publish -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Set environment variables
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 8080

ENTRYPOINT ["dotnet", "MyApp.WebApp.dll"]
```

**Explicação do Dockerfile:**

- **Multi-stage build**: Build em uma imagem SDK, runtime em imagem menor (aspnet)
- **Stage 1 (build)**: Compila a aplicação .NET
- **Stage 2 (runtime)**: Copia apenas os binários compilados
- **Porta 8080**: Mesma porta usada pela API
- **Resultado**: Imagem otimizada (~200MB vs ~700MB do SDK)

### 9.4) Build e push da imagem do frontend

Navegar até o diretório do projeto e fazer build:

```bash
cd Webinars/Webinar4/Apps/MyApp.WebApp

# Build da imagem
docker build -t <docker-hub-account>/myapp-webapp:1.0 .

# Login no Docker Hub (se ainda não estiver logado)
docker login

# Push para Docker Hub
docker push <docker-hub-account>/myapp-webapp:1.0
```

**Importante:** Troque `<docker-hub-account>` pelo seu nome de usuário do Docker Hub!

**Exemplo real:**

```bash
docker build -t tallesvaliatti/myapp-webapp:1.0 .
docker push tallesvaliatti/myapp-webapp:1.0
```

**Verificar imagem criada:**

```bash
docker images | grep myapp-webapp
```

**Testar localmente (opcional):**

```bash
# Primeiro inicie a API localmente ou use uma URL pública
docker run -p 8080:8080 -e ApiSettings__WebApiUrl=http://localhost:5000 $DOCKER_USER/myapp-webapp:1.0

# Abrir no navegador: http://localhost:8080
```

### 9.5) Deployment do frontend

Vamos criar o Deployment para o MyApp.WebApp:

### deployment-webapp.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapp
  namespace: webinar4
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
        image: <docker-hub-account>/myapp-webapp:1.0
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

**Observações importantes:**

- **Nome**: `myapp-webapp`
- **Porta**: 8080 (aplicação ASP.NET Core)

Aplicar:

```bash
kubectl apply -f deployment-webapp.yaml
```

Verificar:

```bash
kubectl get pods -n webinar4 -l app=myapp-webapp
```

### 9.6) Service NodePort para o frontend

### service-web-nodeport.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapp-service
  namespace: webinar4
  labels:
    app: myapp-webapp
spec:
  type: NodePort
  selector:
    app: myapp-webapp
  ports:
  - name: http
    protocol: TCP
    port: 80
    targetPort: 8080
    nodePort: 30090
```

**Observações:**

- **selector**: `app: myapp-webapp` (mesmo label do Deployment)
- **port**: 80 (porta do Service internamente)
- **targetPort**: 8080 (porta do container)
- **nodePort**: 30090 (porta externa no node)

Aplicar:

```bash
kubectl apply -f service-web-nodeport.yaml
```

Verificar:

```bash
kubectl get svc -n webinar4 myapp-webapp-service
```

### 9.7) Testar a aplicação completa

Obter URL do frontend:

```bash
minikube service myapp-webapp-service -n webinar4 --url
```

Isso retorna algo como: `http://192.168.49.2:30090`

Abrir no navegador e você verá:
- **Interface web** do MyApp.WebApp
- **Botão "Atualizar"** para chamar a API
- **Informações da instância** da API (hostname, instance ID, uptime)
- **Lista de produtos** retornados pela API
- **Cada refresh** pode mostrar um pod diferente (load balancing)

🎉 **Arquitetura multi-serviço funcionando!**

**Fluxo completo:**

1. Navegador → NodePort (30090)
2. NodePort → Service `myapp-webapp-service`
3. Service → Pods do MyApp.WebApp
4. MyApp.WebApp → Service `myapp-webapi-service` (DNS interno)
5. Service → Pods do MyApp.WebApi
6. Response ← volta todo o caminho

---

## 10) All-in-One YAML

Para facilitar, vamos criar um único arquivo com todos os recursos:

### all-in-one.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: webinar4
  labels:
    name: webinar4
    purpose: services-demo

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapi
  namespace: webinar4
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
        image: tallesvaliatti/myapp-webapi:3.0
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
  namespace: webinar4
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
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi-nodeport
  namespace: webinar4
  labels:
    app: myapp-webapi
spec:
  type: NodePort
  selector:
    app: myapp-webapi
  ports:
  - name: http
    protocol: TCP
    port: 80
    targetPort: 8080
    nodePort: 30080

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapp
  namespace: webinar4
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
        image: <docker-hub-account>/myapp-webapp:1.0
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
  namespace: webinar4
  labels:
    app: myapp-webapp
spec:
  type: NodePort
  selector:
    app: myapp-webapp
  ports:
  - name: http
    protocol: TCP
    port: 80
    targetPort: 8080
    nodePort: 30090
```

**Deploy completo:**

```bash
# ANTES: trocar '<docker-hub-account>' pelo seu usuário do Docker Hub

kubectl apply -f all-in-one.yaml
```

**Verificar tudo:**

```bash
kubectl get all -n webinar4
```

---

## 11) Comandos úteis de Services

### Listar Services

```bash
# Todos os namespaces
kubectl get svc --all-namespaces

# Namespace específico
kubectl get svc -n webinar4

# Com mais detalhes
kubectl get svc -n webinar4 -o wide
```

### Descrever Service

```bash
kubectl describe svc myapp-webapi-service -n webinar4
```

**O que observar:**

- **Endpoints**: IPs dos pods que fazem parte do service
- **Selector**: Labels usados para selecionar pods
- **Session Affinity**: None (default) - round-robin load balancing

### Ver Endpoints

```bash
kubectl get endpoints -n webinar4

# Detalhes
kubectl describe endpoints myapp-webapi-service -n webinar4
```

Os **Endpoints** são os IPs reais dos pods. O Service encaminha tráfego para esses IPs.

### Port-forward (alternativa para testar)

Se não quiser usar NodePort, pode fazer port-forward:

```bash
# Forward local port 8080 para o service
kubectl port-forward -n webinar4 svc/myapp-webapi-service 8080:80

# Em outro terminal, testar
curl http://localhost:8080/instance
```

### Logs dos pods por label

```bash
# Logs de todos os pods da API
kubectl logs -n webinar4 -l app=myapp-webapi --tail=20

# Seguir logs em tempo real
kubectl logs -n webinar4 -l app=myapp-webapi -f
```

## 12) Diferenças entre ClusterIP, NodePort e LoadBalancer

| Característica | ClusterIP | NodePort | LoadBalancer |
|----------------|-----------|----------|--------------|
| **Acesso** | Interno apenas | Node IP + Porta alta | IP público externo |
| **IP estável** | Sim (ClusterIP) | Não (IP do node pode mudar) | Sim (LB IP) |
| **Porta** | Qualquer | 30000-32767 | Qualquer (80, 443) |
| **Uso** | Inter-pod communication | Dev/Teste | Produção (cloud) |
| **Cloud** | Não depende | Não depende | Requer cloud provider |

### Quando usar cada tipo?

- **ClusterIP**: Comunicação interna entre pods (default)
- **NodePort**: Acesso temporário externo (dev/teste)
- **LoadBalancer**: Produção em cloud (AWS, GCP, Azure)

No Minikube:
- Use **ClusterIP** para comunicação interna
- Use **NodePort** ou `minikube service` para acesso externo

Em produção (cloud):
- Use **ClusterIP** para serviços internos
- Use **LoadBalancer** para serviços externos

---

## 13) Limpeza

### Deletar recursos específicos

```bash
kubectl delete -f all-in-one.yaml
```

### Deletar namespace (remove tudo)
    
```bash
kubectl delete namespace webinar4
```

### Verificar limpeza

```bash
kubectl get all -n webinar4
```