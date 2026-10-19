# Setup e primeiro deploy no Minikube

**O que você vai aprender:** deixar o ambiente pronto (em qualquer sistema operacional) e fazer o seu **primeiro deploy** no Kubernetes local (**Minikube**). Deploy é colocar uma aplicação para rodar. O **Kubernetes** é um sistema que liga, organiza e mantém aplicações rodando. O **Minikube** é uma versão pequena dele que roda no seu próprio computador. Você vai publicar a sua **Web API .NET** dentro de um **container** (uma "caixinha" que leva a aplicação junto com tudo o que ela precisa para rodar) e acessá-la com **kubectl port-forward** (explicado mais abaixo).

**Entregável:** cluster local pronto + app acessível em `http://localhost:8080/products`. Um **cluster** é o conjunto de máquinas que o Kubernetes gerencia. Aqui, é uma só, dentro do seu computador.

---

## 1) Instalar Docker Desktop

O **Docker Desktop** é o programa que cria e roda containers no seu computador.

📖 **Documentação oficial:**
- [macOS installation guide](https://docs.docker.com/desktop/setup/install/mac-install/)
- [Linux installation guide](https://docs.docker.com/desktop/setup/install/linux/)
- [Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/)

**Importante:** depois de instalar, **abra o Docker Desktop** e confira se ele está rodando.

---

## 2) Testar instalação do Docker

Confira se o Docker está funcionando:

```bash
docker ps
```

Se o comando rodar sem erro, você pode seguir.

Você também pode testar com um container simples:

```bash
docker run --rm hello-world
```

Esperado: uma mensagem de sucesso do Docker.

---

## 3) Conhecer nossa Web API (.NET 10)

Nossa aplicação é uma **Web API .NET 10** bem simples. Uma Web API é um programa que responde a pedidos feitos pela internet (ou pela rede). Ela tem um **endpoint**, que é um "endereço" específico dentro da API:

- **GET** `/products` — retorna uma lista de produtos (dados fixos, sem banco de dados)

### Estrutura do projeto

```
MyApp.WebApi/
├── Program.cs          # Código principal com endpoint /products
├── MyApp.WebApi.csproj # Projeto .NET
├── appsettings.json
└── Dockerfile          # (vamos criar)
```

### Endpoint de exemplo

A API retorna algo assim:

```json
[
  { "id": 1, "name": "Notebook", "price": 2500.00 },
  { "id": 2, "name": "Mouse", "price": 50.00 },
  { "id": 3, "name": "Teclado", "price": 150.00 }
]
```

**Importante:** a API roda **apenas em HTTP** (porta 8080), sem HTTPS.

---

## 4) Criar o Dockerfile

**Por que isso importa:** o Dockerfile é a "receita" que diz ao Docker como montar a sua aplicação. Sem ele, não dá para criar o container.

Vamos colocar a aplicação em um container. Para isso, crie um `Dockerfile` na pasta do projeto `MyApp.WebApi/`.

> **Importante:** este Dockerfile precisa ficar **dentro** da pasta do projeto, onde está o `MyApp.WebApi.csproj`.

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
- Usa *multi-stage build*: compila em uma etapa e copia só o resultado para a etapa final, o que deixa a imagem menor
- Baixa as dependências do projeto
- Publica (compila) a aplicação
- Configura a aplicação para rodar em HTTP na porta 8080

---

## 5) Criar a imagem Docker

Uma **imagem** é o "molde" pronto da sua aplicação. A partir dela, o Docker cria quantos containers você quiser (como um bolo feito a partir da mesma receita).

Vá até a pasta `MyApp.WebApi/` e rode:

```bash
cd Modulos/01-Setup-e-Primeiro-Deploy/Apps/MyApp.WebApi
docker build -t myapp-webapi:1.0 .
```

Confira se a imagem foi criada:

```bash
docker images
```

Esperado: ver `myapp-webapi` com a tag `1.0`. A **tag** é um rótulo, normalmente usado para indicar a versão.

---

## 6) Testar a imagem localmente

Antes de levar para o Kubernetes, vamos garantir que o container funciona:

```bash
docker run --rm -p 8080:8080 myapp-webapi:1.0
```

Em outro terminal, teste o endpoint:

```bash
curl http://localhost:8080/products
```

Você deve ver o JSON com a lista de produtos.

---

## 7) Fazer push para o Docker Hub

**Por que isso importa:** o Kubernetes precisa baixar a imagem de algum lugar. Por isso vamos colocá-la em um registry público.

O **Docker Hub** é um **registry**, ou seja, um "depósito" na internet onde ficam guardadas imagens. Fazer **push** é enviar a sua imagem para lá. Assim o Kubernetes consegue baixá-la.

### 7.1 Login no Docker Hub

```bash
docker login
```

Digite seu usuário e senha do Docker Hub.

### 7.2 Tag da imagem

Vamos usar: `<docker-hub-account>/myapp-webapi:1.0`

> **Nota:** no meu caso, vou usar `tallesvaliatti` como docker-hub-account. Troque pelo seu usuário.

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

A tag `latest` costuma indicar "a versão mais recente".

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

Teste rodando a imagem direto do Docker Hub:

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

O **kubectl** é a ferramenta de linha de comando para "conversar" com o Kubernetes: é por ela que você dá as ordens ao cluster.

📖 **Documentação oficial:** [Minikube Getting Started](https://minikube.sigs.k8s.io/docs/start/)

### Verificar instalação

```bash
kubectl version --client
minikube version
```

Esperado: as versões aparecem na tela, sem erros.

---

## 9) Iniciar o cluster Minikube (usando Docker Desktop como driver)

**Importante:** sempre que for trabalhar com Kubernetes, você precisa **iniciar o cluster** primeiro.

### 9.1 Verificar se o Docker Desktop está rodando

Antes de tudo, confirme que o Docker Desktop está aberto e ativo:

```bash
docker ps
```

Se o comando funcionar, você está pronto.

### 9.2 Iniciar o Minikube

### 9.2 Iniciar o Minikube

```bash
minikube start --driver=docker
```

Esse comando:
- Cria um cluster Kubernetes local
- Usa o Docker como *driver*, ou seja, roda o cluster dentro de containers em vez de máquinas virtuais (VMs)
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

Agora veja os **nodes**. Um node é cada máquina do cluster que roda as aplicações:

```bash
kubectl get nodes
```

Esperado: 1 node com status `Ready`.

### 9.4 Confirmar contexto do kubectl

O **contexto** diz ao kubectl com qual cluster ele está falando. Confira se é o certo:

```bash
kubectl config current-context
```

Se não for `minikube`, ajuste:

```bash
kubectl config use-context minikube
```

---

## 10) Fazer o primeiro deploy no Kubernetes

**Por que isso importa:** aqui a sua aplicação passa a rodar de verdade dentro do Kubernetes.

Agora vamos criar:

* **Deployment** (roda os Pods). Um **Pod** é a menor unidade do Kubernetes: um "envelope" que guarda um ou mais containers. O **Deployment** é quem cuida para que os Pods fiquem sempre rodando.
* **Service ClusterIP** (endereço interno estável). O **Service** é como um "número fixo de telefone" para os Pods: mesmo que eles mudem, o endereço continua o mesmo.

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
* Por padrão, cria **1 réplica** (uma cópia da aplicação rodando)
* O Pod vai baixar a imagem do Docker Hub
* Aplica a label padrão `app=myapp-webapi`. Uma **label** é uma etiqueta que identifica o recurso. O Service usa essa etiqueta para achar os Pods.

### 10.2 Criar o Service (ClusterIP) na porta 8080

```bash
kubectl expose deployment myapp-webapi --type=ClusterIP --port=8080 --target-port=8080
```

O que isso faz:

* Cria um **Service** chamado `myapp-webapi`
* `ClusterIP` = acessível **apenas dentro do cluster** (de fora, não dá para acessar direto)
* Porta do Service: `8080`
* Porta do container (API): `8080`

---

## 11) Verificar recursos (pods e services)

### Pods

```bash
kubectl get pods
```

Esperado: Pod com status `Running` (rodando).

### Services

```bash
kubectl get svc
```

Esperado: `myapp-webapi` com `TYPE ClusterIP` e porta `8080`.

---

## 12) Acessar a API via port-forward (HTTP)

**Por que isso importa:** é assim que você vê a sua API respondendo no navegador ou no terminal, mesmo com o Service sendo interno.

Como o `ClusterIP` só funciona dentro do cluster, vamos usar o **port-forward**. Ele cria um "túnel" que liga uma porta do seu computador ao Service dentro do cluster:

```bash
kubectl port-forward svc/myapp-webapi 8080:8080
```

Deixe esse comando rodando. Em outro terminal, rode:

```bash
curl http://localhost:8080/products
```

**Pronto:** seu primeiro deploy no Kubernetes local 🎉

---

## 13) Explorar os recursos criados (comandos úteis)

Agora vamos olhar com calma o que foi criado no cluster.

### 13.1 Ver todos os recursos

```bash
kubectl get all
```

Isso mostra: pods, services, deployments e replicasets. O **ReplicaSet** é criado pelo Deployment e garante que o número certo de Pods esteja rodando.

### 13.2 Detalhes do Deployment

```bash
kubectl get deployment myapp-webapi
```

Ver em formato YAML (a configuração completa). **YAML** é um formato de texto simples, usado para descrever configurações:

```bash
kubectl get deployment myapp-webapi -o yaml
```

Ver detalhes e eventos:

```bash
kubectl describe deployment myapp-webapi
```

O que observar:
- **Replicas:** quantas réplicas foram pedidas e quantas estão disponíveis
- **Selector:** labels usadas para encontrar os Pods
- **Strategy:** como as atualizações são feitas (RollingUpdate = troca os Pods aos poucos)
- **Events:** histórico do que aconteceu com o deployment

### 13.3 Detalhes do Pod

Listar pods com mais informações:

```bash
kubectl get pods -o wide
```

Isso mostra: o IP do Pod, o Node onde ele está rodando etc.

Ver todos os detalhes do Pod:

```bash
kubectl describe pod -l app=myapp-webapi
```

O que observar:
- **Status:** Running, Pending etc.
- **IP:** endereço IP interno do Pod
- **Containers:** lista de containers dentro do Pod
- **Events:** histórico (download da imagem, início do container etc.)

Ver os logs do container (as mensagens que a aplicação escreve enquanto roda):

```bash
kubectl logs -l app=myapp-webapi
```

Ver os logs em tempo real (follow):

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

Ver os endpoints do Service:

```bash
kubectl get endpoints myapp-webapi
```

Isso mostra os IPs dos Pods para onde o Service está mandando as requisições.

> **Nota:** pode aparecer um aviso (warning) sobre `v1 Endpoints is deprecated`. Isso é normal. A forma mais nova é o `EndpointSlice`, mas o comando acima continua funcionando.

Exemplo de saída:

```
NAME           ENDPOINTS         AGE
myapp-webapi   10.244.0.3:8080   22m
```

Comando alternativo, usando a forma mais nova (EndpointSlice):

```bash
kubectl get endpointslices -l kubernetes.io/service-name=myapp-webapi
```

Exemplo de saída:

```
NAME                 ADDRESSTYPE   PORTS   ENDPOINTS    AGE
myapp-webapi-5g9pp   IPv4          8080    10.244.0.3   23m
```

**Diferença entre os comandos:**
- `kubectl get endpoints` - API v1 (deprecada, ou seja, em desuso, a partir da v1.33+, mas ainda funciona)
- `kubectl get endpointslices` - API discovery.k8s.io/v1 (recomendada e mais escalável)

Os dois mostram os mesmos IPs dos Pods. O EndpointSlice é a forma moderna e recomendada.

### 13.5 Ver labels e selectors

Um **selector** é um filtro que busca recursos pelas suas labels.

Ver as labels dos Pods:

```bash
kubectl get pods --show-labels
```

Filtrar por uma label específica:

```bash
kubectl get pods -l app=myapp-webapi
```

Ver as labels do Deployment:

```bash
kubectl get deployment myapp-webapi --show-labels
```

---

## 14) Limpar os recursos criados

Quando terminar de testar, ou se quiser recriar tudo do zero, siga estes passos:

### 14.1 Deletar o Service

```bash
kubectl delete svc myapp-webapi
```

Confirme que foi removido:

```bash
kubectl get svc
```

### 14.2 Deletar o Deployment

```bash
kubectl delete deployment myapp-webapi
```

Isso também remove automaticamente os Pods ligados a ele.

Confirme que foi removido:

```bash
kubectl get deployments
kubectl get pods
```

### 14.3 Verificar que tudo foi removido

```bash
kubectl get all
```

Esperado: apenas o service `kubernetes` (o service padrão que já vem no cluster).

### 14.4 Deletar todos os recursos de uma vez

Se você criou vários recursos e quer apagar tudo o que é do app:

```bash
kubectl delete all -l app=myapp-webapi
```

Esse comando usa o selector de label para apagar todos os recursos (pods, services, deployments, replicasets) que tenham a label `app=myapp-webapi`.

---

## 15) Desligar o cluster Minikube

Quando terminar de trabalhar, é uma boa prática **parar o cluster** para liberar memória e processador do seu computador.

### 15.1 Parar o cluster (recomendado)

```bash
minikube stop
```

Isso desliga o cluster, mas guarda todos os recursos. Quando você rodar `minikube start` de novo, tudo estará lá.

Verificar status:

```bash
minikube status
```

Esperado: `host: Stopped`