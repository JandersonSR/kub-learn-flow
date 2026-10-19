# Live 1 — Setup + primeiro deploy no Minikube

Objetivo da live: deixar o ambiente pronto (qualquer OS) e fazer o **primeiro deploy** no Kubernetes local (**Minikube**), publicando a sua **Web API .NET** (container) e acessando via **kubectl port-forward**.

**Entregável:** cluster local pronto + app acessível em `http://localhost:8080/products`.

---

## 1) Instalar Docker Desktop

📖 **Documentação oficial:**
- [macOS installation guide](https://docs.docker.com/desktop/setup/install/mac-install/)
- [Linux installation guide](https://docs.docker.com/desktop/setup/install/linux/)
- [Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/)

**Importante:** Após instalar, **abrir o Docker Desktop** e garantir que está rodando.

---

## 2) Testar instalação do Docker

Valide que o Docker está funcionando:

```bash
docker ps
```

Se esse comando funciona sem erro, você está pronto para seguir.

Você também pode testar com um container simples:

```bash
docker run --rm hello-world
```

Esperado: mensagem de sucesso do Docker.

---

## 3) Conhecer nossa Web API (.NET 10)

Nossa aplicação é uma **Web API .NET 10** minimalista que expõe um endpoint:

- **GET** `/products` — retorna uma lista de produtos (dados estáticos)

### Estrutura do projeto

```
MyApp.WebApi/
├── Program.cs          # Código principal com endpoint /products
├── MyApp.WebApi.csproj # Projeto .NET
├── appsettings.json
└── Dockerfile          # (vamos criar)
```

### Endpoint de exemplo

A API retorna algo como:

```json
[
  { "id": 1, "name": "Notebook", "price": 2500.00 },
  { "id": 2, "name": "Mouse", "price": 50.00 },
  { "id": 3, "name": "Teclado", "price": 150.00 }
]
```

**Importante:** A API roda em **HTTP apenas** (porta 8080), sem HTTPS.

---

## 4) Criar o Dockerfile

Vamos containerizar a aplicação criando um `Dockerfile` na pasta do projeto `MyApp.WebApi/`.

> **Importante:** Esse Dockerfile assume que ele está **dentro** da pasta do projeto, onde existe `MyApp.WebApi.csproj`.

Crie o arquivo `Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src

COPY ["MyApp.WebApi.csproj", "./"]
RUN dotnet restore "./MyApp.WebApi.csproj"

COPY . .
RUN dotnet publish "./MyApp.WebApi.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app

# HTTP apenas (Kestrel escuta na 8080 dentro do container)
ENV ASPNETCORE_URLS=http://+:8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "MyApp.WebApi.dll"]
```

**O que esse Dockerfile faz:**
- Multi-stage build (otimizado)
- Restaura dependências
- Publica a aplicação
- Configura para rodar em HTTP na porta 8080

---

## 5) Criar a imagem Docker

Navegue até a pasta `MyApp.WebApi/` e execute:

```bash
cd Webinar1/Apps/MyApp.WebApi
docker build -t myapp-webapi:1.0 .
```

Verificar que a imagem foi criada:

```bash
docker images
```

Esperado: ver `myapp-webapi` com tag `1.0`.

---

## 6) Testar a imagem localmente

Antes de subir para o Kubernetes, vamos garantir que o container funciona:

```bash
docker run --rm -p 8080:8080 myapp-webapi:1.0
```

Em outro terminal, teste o endpoint:

```bash
curl http://localhost:8080/products
```

Você deve ver o JSON da lista de produtos.

---

## 7) Fazer push para o Docker Hub

Agora vamos publicar a imagem no Docker Hub para que o Kubernetes possa baixá-la.

### 7.1 Login no Docker Hub

```bash
docker login
```

Digite seu usuário e senha do Docker Hub.

### 7.2 Tag da imagem

Vamos usar: `<docker-hub-account>/myapp-webapi:1.0`

> **Nota:** No meu caso, vou usar `tallesvaliatti` como docker-hub-account.

```bash
docker tag myapp-webapi:1.0 <docker-hub-account>/myapp-webapi:1.0
```

Exemplo (no meu caso):

```bash
docker tag myapp-webapi:1.0 tallesvaliatti/myapp-webapi:1.0
```

### 7.3 Push da imagem

```bash
docker push <docker-hub-account>/myapp-webapi:1.0
```

Exemplo (no meu caso):

```bash
docker push tallesvaliatti/myapp-webapi:1.0
```

### 7.4 (Opcional) Publicar tag `latest`

```bash
docker tag myapp-webapi:1.0 <docker-hub-account>/myapp-webapi:latest
docker push <docker-hub-account>/myapp-webapi:latest
```

Exemplo (no meu caso):

```bash
docker tag myapp-webapi:1.0 tallesvaliatti/myapp-webapi:latest
docker push tallesvaliatti/myapp-webapi:latest
```

### 7.5 Validar o push

Teste rodando direto do Docker Hub:

```bash
docker run --rm -p 8080:8080 <docker-hub-account>/myapp-webapi:1.0
```

Exemplo (no meu caso):

```bash
docker run --rm -p 8080:8080 tallesvaliatti/myapp-webapi:1.0
```

Se funcionar, sua imagem está pública e pronta para o Kubernetes! ✅

---

## 8) Instalar kubectl e Minikube

📖 **Documentação oficial:** [Minikube Getting Started](https://minikube.sigs.k8s.io/docs/start/)

### Verificar instalação

```bash
kubectl version --client
minikube version
```

Esperado: versões instaladas exibidas sem erros.

---

## 9) Iniciar o cluster Minikube (usando Docker Desktop como driver)

**Importante:** Sempre que for trabalhar com Kubernetes, você precisa **iniciar o cluster** primeiro.

### 9.1 Verificar se o Docker Desktop está rodando

Antes de tudo, confirme que o Docker Desktop está aberto e ativo:

```bash
docker ps
```

Se esse comando funcionar, você está pronto.

### 9.2 Iniciar o Minikube

### 9.2 Iniciar o Minikube

```bash
minikube start --driver=docker
```

Esse comando:
- Cria um cluster Kubernetes local
- Usa o Docker como driver (containers ao invés de VMs)
- Pode demorar alguns minutos na primeira vez

Saída esperada: mensagens de progresso e `Done! kubectl is now configured to use "minikube" cluster...`

### 9.3 Verificar status do cluster

```bash
minikube status
```

Esperado:
```
minikube
type: Control Plane
host: Running
kubelet: Running
apiserver: Running
kubeconfig: Configured
```

Verificar nodes:

```bash
kubectl get nodes
```

Esperado: 1 node com status `Ready`.

### 9.4 Confirmar contexto do kubectl

Garantir que você está no contexto correto:

```bash
kubectl config current-context
```

Se não for `minikube`, ajuste:

```bash
kubectl config use-context minikube
```

---

## 10) Fazer o primeiro deploy no Kubernetes

Agora vamos criar:

* **Deployment** (roda os Pods)
* **Service ClusterIP** (endereço interno estável)

### 10.1 Criar o Deployment

```bash
kubectl create deployment myapp-webapi --image=<docker-hub-account>/myapp-webapi:1.0
```

Exemplo (no meu caso):

```bash
kubectl create deployment myapp-webapi --image=tallesvaliatti/myapp-webapi:1.0
```

O que isso faz:

* Cria um **Deployment** chamado `myapp-webapi`
* Por padrão cria **1 réplica**
* O Pod vai baixar a imagem do Docker Hub
* Aplica label padrão `app=myapp-webapi` (usado pelo Service)

### 10.2 Criar o Service (ClusterIP) na porta 8080

```bash
kubectl expose deployment myapp-webapi --type=ClusterIP --port=8080 --target-port=8080
```

O que isso faz:

* Cria um **Service** chamado `myapp-webapi`
* `ClusterIP` = acessível **apenas dentro do cluster**
* Porta do Service: `8080`
* Porta do container (API): `8080`

---

## 11) Verificar recursos (pods e services)

### Pods

```bash
kubectl get pods
```

Esperado: Pod em `Running`.

### Services

```bash
kubectl get svc
```

Esperado: `myapp-webapi` com `TYPE ClusterIP` e porta `8080`.

---

## 12) Acessar a API via port-forward (HTTP)

Como `ClusterIP` é interno, vamos fazer um "tunelamento" da sua máquina local para o Service:

```bash
kubectl port-forward svc/myapp-webapi 8080:8080
```

Enquanto esse comando estiver rodando, em outro terminal:

```bash
curl http://localhost:8080/products
```

**Pronto:** seu primeiro deploy no Kubernetes local 🎉

---

## 13) Explorar os recursos criados (comandos úteis)

Agora vamos explorar em detalhes o que foi criado no cluster.

### 13.1 Ver todos os recursos

```bash
kubectl get all
```

Isso mostra: pods, services, deployments, replicasets.

### 13.2 Detalhes do Deployment

```bash
kubectl get deployment myapp-webapi
```

Ver em formato YAML (configuração completa):

```bash
kubectl get deployment myapp-webapi -o yaml
```

Ver detalhes e eventos:

```bash
kubectl describe deployment myapp-webapi
```

O que observar:
- **Replicas:** quantas réplicas estão configuradas e disponíveis
- **Selector:** labels usadas para identificar os Pods
- **Strategy:** estratégia de atualização (RollingUpdate)
- **Events:** histórico de eventos do deployment

### 13.3 Detalhes do Pod

Listar pods com mais informações:

```bash
kubectl get pods -o wide
```

Isso mostra: IP do Pod, Node onde está rodando, etc.

Ver detalhes completos do Pod:

```bash
kubectl describe pod -l app=myapp-webapi
```

O que observar:
- **Status:** Running, Pending, etc.
- **IP:** endereço IP interno do Pod
- **Containers:** lista de containers no Pod
- **Events:** histórico (pull da imagem, start do container, etc.)

Ver logs do container:

```bash
kubectl logs -l app=myapp-webapi
```

Ver logs em tempo real (follow):

```bash
kubectl logs -l app=myapp-webapi -f
```

### 13.4 Detalhes do Service

```bash
kubectl get svc myapp-webapi
```

Ver em formato YAML:

```bash
kubectl get svc myapp-webapi -o yaml
```

Ver detalhes:

```bash
kubectl describe svc myapp-webapi
```

O que observar:
- **Type:** ClusterIP
- **Cluster-IP:** IP interno do Service
- **Port:** 8080 (porta do Service)
- **TargetPort:** 8080 (porta do container)
- **Endpoints:** IPs dos Pods que estão respondendo

Ver endpoints do Service:

```bash
kubectl get endpoints myapp-webapi
```

Isso mostra os IPs dos Pods que o Service está encaminhando tráfego.

> **Nota:** Você pode ver um warning sobre `v1 Endpoints is deprecated`. Isso é normal. A API mais nova é `EndpointSlice`, mas o comando acima ainda funciona perfeitamente.

Exemplo de saída:

```
NAME           ENDPOINTS         AGE
myapp-webapi   10.244.0.3:8080   22m
```

Comando alternativo usando a API mais nova (EndpointSlice):

```bash
kubectl get endpointslices -l kubernetes.io/service-name=myapp-webapi
```

Exemplo de saída:

```
NAME                 ADDRESSTYPE   PORTS   ENDPOINTS    AGE
myapp-webapi-5g9pp   IPv4          8080    10.244.0.3   23m
```

**Diferença entre os comandos:**
- `kubectl get endpoints` - API v1 (deprecada em v1.33+, mas ainda funciona)
- `kubectl get endpointslices` - API discovery.k8s.io/v1 (recomendada, mais escalável)

Ambos mostram os mesmos IPs dos Pods, mas EndpointSlice é a forma moderna e recomendada.

### 13.5 Ver labels e selectors

Ver labels dos Pods:

```bash
kubectl get pods --show-labels
```

Filtrar por label específica:

```bash
kubectl get pods -l app=myapp-webapi
```

Ver labels do Deployment:

```bash
kubectl get deployment myapp-webapi --show-labels
```

---

## 14) Limpar os recursos criados

Quando você terminar de testar ou quiser recriar tudo do zero, siga estes passos:

### 14.1 Deletar o Service

```bash
kubectl delete svc myapp-webapi
```

Confirmar que foi removido:

```bash
kubectl get svc
```

### 14.2 Deletar o Deployment

```bash
kubectl delete deployment myapp-webapi
```

Isso também remove automaticamente os Pods associados.

Confirmar que foi removido:

```bash
kubectl get deployments
kubectl get pods
```

### 14.3 Verificar que tudo foi removido

```bash
kubectl get all
```

Esperado: apenas o service `kubernetes` (service padrão do cluster).

### 14.4 Deletar todos os recursos de uma vez

Caso tenha criado vários recursos e queira deletar tudo relacionado ao app:

```bash
kubectl delete all -l app=myapp-webapi
```

Esse comando usa o label selector para deletar todos os recursos (pods, services, deployments, replicasets) que tenham a label `app=myapp-webapi`.

---

## 15) Desligar o cluster Minikube

Quando terminar de trabalhar, é uma boa prática **parar o cluster** para economizar recursos do seu computador.

### 15.1 Parar o cluster (recomendado)

```bash
minikube stop
```

Isso para o cluster mas mantém todos os recursos. Quando você iniciar novamente com `minikube start`, tudo estará lá.

Verificar status:

```bash
minikube status
```

Esperado: `host: Stopped`