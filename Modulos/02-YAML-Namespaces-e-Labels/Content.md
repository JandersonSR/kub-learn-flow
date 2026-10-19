# YAML, Namespaces e Labels

**O que você vai aprender:** organizar o deploy (a publicação do app no cluster) usando **manifests YAML**, criar um **Namespace** só para o app, aplicar **Labels** padronizadas e **filtrar recursos** com selectors.

- **YAML** é um formato de texto simples, com recuo (espaços) para indicar hierarquia, parecido com uma lista de tópicos.
- **Manifest** é um arquivo YAML que descreve o que você quer no cluster, como uma "receita" que o Kubernetes segue.
- **Namespace** é uma "pasta" dentro do cluster para agrupar os recursos de um app ou equipe.
- **Label** é uma etiqueta no formato chave=valor (ex.: `app=myapp-webapi`) colada em um recurso.
- **Selector** é um filtro que busca recursos pelas suas labels.

**Entregável:** app em um namespace próprio, com labels consistentes e manifests YAML que podem ser guardados no Git (versionáveis).

---

## Pré-requisitos

Cluster Minikube ativo:

```bash
minikube status
```

**Importante:** se o cluster estiver parado, inicie-o antes de começar:

```bash
minikube start --driver=docker
```

Verificar que está funcionando:

```bash
kubectl get nodes
```

Esperado: 1 node (a máquina que roda o cluster) com status `Ready`.

---

## O que vamos aprender

1. **Por que usar YAML** em vez de comandos imperativos (comandos digitados um a um no terminal)
2. **Namespaces** - isolar e organizar recursos
3. **Labels e Selectors** - identificar e filtrar recursos
4. **Estrutura de manifests YAML** - as partes de cada arquivo
5. **Boas práticas** - padrões de organização

---

## 1) Limpar recursos do módulo Setup e primeiro deploy (se existirem)

Se você ainda tem os recursos do módulo **Setup e primeiro deploy**, vamos limpar:

```bash
kubectl delete all -l app=myapp-webapi
```

Verificar:

```bash
kubectl get all
```

Esperado: apenas o service `kubernetes` padrão.

---

## 2) Entender Namespaces

**Por que isso importa:** sem namespaces, tudo fica misturado no mesmo lugar. Com eles, cada app tem o seu espaço.

### O que é um Namespace?

**Namespace** é um cluster virtual dentro do cluster real. Ele permite:
- **Isolamento lógico** de recursos (um app não "enxerga" a bagunça do outro)
- **Organização** por ambiente (dev, staging, prod)
- **Quotas de recursos** por namespace (limite de CPU e memória para cada um)
- **Controle de acesso** por namespace

### Listar namespaces existentes

```bash
kubectl get namespaces
```

ou

```bash
kubectl get ns
```

Você verá namespaces padrão:
- `default` - namespace padrão (onde trabalhamos no módulo **Setup e primeiro deploy**)
- `kube-system` - componentes internos do Kubernetes
- `kube-public` - recursos públicos
- `kube-node-lease` - sinais de "estou vivo" (heartbeat) dos nodes

### Por que criar nosso próprio namespace?

- ✅ Separa nosso app dos recursos do sistema
- ✅ Facilita limpar tudo de uma vez
- ✅ Prepara para ambientes múltiplos (dev/prod)
- ✅ Boa prática para projetos reais

---

## 3) Criar namespace com YAML

Vamos criar um namespace chamado `myapp` para nossa aplicação.

### 3.1 Criar o arquivo de namespace

Crie o diretório para os manifests:

Crie o arquivo `namespace.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: myapp
  labels:
    name: myapp
    environment: dev
```

**Partes do YAML:**
- `apiVersion: v1` - versão da API do Kubernetes
- `kind: Namespace` - tipo de recurso
- `metadata` - dados de identificação do recurso
  - `name` - nome único do namespace
  - `labels` - labels para identificação

### 3.2 Aplicar o namespace

O comando `kubectl apply -f` lê o arquivo e pede ao Kubernetes para deixar o cluster igual ao que está descrito nele (cria ou atualiza).

```bash
kubectl apply -f namespace.yaml
```

Saída esperada:
```
namespace/myapp created
```

### 3.3 Verificar o namespace criado

```bash
kubectl get ns myapp
```

Ver com labels:

```bash
kubectl get ns myapp --show-labels
```

Ver detalhes:

```bash
kubectl describe ns myapp
```

---

## 4) Criar Deployment com YAML

**Por que isso importa:** o arquivo YAML fica salvo. Você pode repetir, revisar e versionar o deploy, em vez de depender de comandos digitados.

Agora vamos criar o Deployment usando YAML em vez de comandos imperativos. O **Deployment** é o recurso que mantém seu app rodando: ele cria os Pods (a "caixinha" onde o contêiner do app roda) e recria os que caírem.

### 4.1 Criar o arquivo deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapi
  namespace: myapp
  labels:
    app: myapp-webapi
    component: backend
    environment: dev
    version: "1.0"
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp-webapi
  template:
    metadata:
      labels:
        app: myapp-webapi
        component: backend
        environment: dev
        version: "1.0"
    spec:
      containers:
      - name: webapi
        image: your-docker-hub-account/myapp-webapi:1.0
        ports:
        - containerPort: 8080
          name: http
          protocol: TCP
        env:
        - name: ASPNETCORE_ENVIRONMENT
          value: "Development"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
```

**Exemplo (troque <docker-hub-account> pelo seu usuário do Docker Hub; no meu caso, `tallesvaliatti`):**

```yaml
        image: tallesvaliatti/myapp-webapi:1.0
```

**Partes do Deployment:**

- **metadata:**
  - `name` - nome do Deployment
  - `namespace` - namespace onde será criado
  - `labels` - labels do próprio Deployment

- **spec:**
  - `replicas: 2` - número de réplicas, ou seja, cópias idênticas do Pod rodando ao mesmo tempo (aumentamos para 2!)
  - `selector.matchLabels` - como o Deployment encontra seus Pods
  - `template` - modelo usado para criar cada Pod
    - `metadata.labels` - labels dos Pods (devem incluir as matchLabels)
    - `spec.containers` - containers do Pod
      - `name` - nome do container
      - `image` - imagem Docker
      - `ports` - portas expostas
      - `env` - variáveis de ambiente
      - `resources` - limites de CPU/memória

### 4.2 Aplicar o Deployment

```bash
kubectl apply -f deployment.yaml
```

Saída esperada:
```
deployment.apps/myapp-webapi created
```

### 4.3 Verificar o Deployment

**Importante:** agora precisamos informar o namespace em todos os comandos, com `-n myapp`!

```bash
kubectl get deployments -n myapp
```

Ver Pods criados:

```bash
kubectl get pods -n myapp
```

Esperado: **2 Pods** em Running (porque definimos `replicas: 2`).

Ver com labels:

```bash
kubectl get pods -n myapp --show-labels
```

Ver detalhes do Deployment:

```bash
kubectl describe deployment myapp-webapi -n myapp
```

### 4.4 Dica: definir namespace padrão temporariamente

Para não precisar digitar `-n myapp` em todos os comandos:

```bash
kubectl config set-context --current --namespace=myapp
```

Verificar:

```bash
kubectl config view --minify | grep namespace:
```

Agora você pode omitir o `-n myapp`:

```bash
kubectl get pods
kubectl get deployments
```

**Para voltar ao namespace default:**

```bash
kubectl config set-context --current --namespace=default
```

---

## 5) Criar Service com YAML

O **Service** dá um endereço fixo para acessar os Pods. Os Pods podem mudar de IP, mas o Service continua no mesmo endereço, como o número fixo de um atendimento que repassa a ligação.

### 5.1 Criar o arquivo service.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi
  namespace: myapp
  labels:
    app: myapp-webapi
    component: backend
    environment: dev
spec:
  type: ClusterIP
  selector:
    app: myapp-webapi
  ports:
  - name: http
    port: 8080
    targetPort: 8080
    protocol: TCP
```

**Partes do Service:**

- **metadata:**
  - `name` - nome do Service
  - `namespace` - namespace onde será criado
  - `labels` - labels do Service

- **spec:**
  - `type: ClusterIP` - tipo de Service (acessível só de dentro do cluster)
  - `selector` - como o Service encontra os Pods (procura Pods com essas labels)
  - `ports` - mapeamento de portas
    - `name` - nome da porta
    - `port` - porta do Service (onde outros serviços chamam)
    - `targetPort` - porta do container (onde o app escuta)
    - `protocol` - TCP/UDP

### 5.2 Aplicar o Service

```bash
kubectl apply -f service.yaml
```

Saída esperada:
```
service/myapp-webapi created
```

### 5.3 Verificar o Service

```bash
kubectl get svc -n myapp
```

Ver detalhes:

```bash
kubectl describe svc myapp-webapi -n myapp
```

Ver endpoints (os IPs dos Pods para onde o Service envia as requisições):

```bash
kubectl get endpoints myapp-webapi -n myapp
```

Ou usando EndpointSlice:

```bash
kubectl get endpointslices -n myapp -l kubernetes.io/service-name=myapp-webapi
```

Esperado: **2 endpoints** (porque temos 2 Pods).

---

## 6) Testar a aplicação

### 6.1 Port-forward para o Service

O port-forward cria um "túnel" da porta do seu computador até o Service no cluster. Deixe o comando rodando.

```bash
kubectl port-forward -n myapp svc/myapp-webapi 8080:8080
```

### 6.2 Testar o endpoint

Em outro terminal:

```bash
curl http://localhost:8080/products
```

Você deve ver o JSON da lista de produtos. ✅

---

## 7) Trabalhar com Labels e Selectors

**Por que isso importa:** labels e selectors são a "cola" do Kubernetes. É por eles que o Deployment acha seus Pods e o Service sabe para onde mandar o tráfego.

Labels são pares chave-valor que identificam recursos. Vamos ver como usá-las.

### 7.1 Ver todos os recursos com labels

```bash
kubectl get all -n myapp --show-labels
```

### 7.2 Filtrar por label específica

Apenas recursos com `app=myapp-webapi`:

```bash
kubectl get all -n myapp -l app=myapp-webapi
```

Apenas recursos com `component=backend`:

```bash
kubectl get all -n myapp -l component=backend
```

Apenas recursos com `version=1.0`:

```bash
kubectl get pods -n myapp -l version=1.0
```

### 7.3 Filtrar com múltiplas labels

Pods com `app=myapp-webapi` E `environment=dev`:

```bash
kubectl get pods -n myapp -l app=myapp-webapi,environment=dev
```

### 7.4 Filtrar por label com operadores

Pods que NÃO têm `environment=prod`:

```bash
kubectl get pods -n myapp -l environment!=prod
```

Pods que têm a label `app` (qualquer valor):

```bash
kubectl get pods -n myapp -l app
```

Pods que NÃO têm a label `app`:

```bash
kubectl get pods -n myapp -l '!app'
```

### 7.5 Ver apenas valores de labels específicas

```bash
kubectl get pods -n myapp -L app,version,component
```

Isso adiciona colunas com os valores dessas labels.

---

## 8) Adicionar labels a recursos existentes

### 8.1 Adicionar label a um Pod específico

Primeiro, pegue o nome de um Pod:

```bash
kubectl get pods -n myapp
```

Adicionar label `tier=api`:

```bash
kubectl label pod <pod-name> -n myapp tier=api
```

Exemplo:

```bash
kubectl label pod myapp-webapi-7d8f9c5b4-xk2lm -n myapp tier=api
```

### 8.2 Sobrescrever label existente

```bash
kubectl label pod <pod-name> -n myapp version=1.1 --overwrite
```

### 8.3 Remover label

```bash
kubectl label pod <pod-name> -n myapp tier-
```

O `-` no final remove a label.

### 8.4 Adicionar label ao namespace

```bash
kubectl label namespace myapp team=backend-team
```

Verificar:

```bash
kubectl get ns myapp --show-labels
```

---

## 9) Organização de arquivos YAML

### 9.1 Estrutura recomendada

```
Manifests/
├── yaml-namespaces-labels/
│   ├── namespace.yaml
│   ├── deployment.yaml
│   └── service.yaml
```

### 9.2 Aplicar todos os arquivos de uma vez

Aplicar tudo em ordem:

```bash
kubectl apply -f namespace.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
```

Ou aplicar toda a pasta:

```bash
kubectl apply -f .
```

**Nota:** o Kubernetes aplica os arquivos respeitando as dependências entre eles.

### 9.3 Arquivo único com múltiplos recursos

Você também pode colocar tudo em um único arquivo, separando com `---`:

Crie `all-in-one.yaml`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: myapp
  labels:
    name: myapp
    environment: dev
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapi
  namespace: myapp
  labels:
    app: myapp-webapi
    component: backend
    environment: dev
    version: "1.0"
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp-webapi
  template:
    metadata:
      labels:
        app: myapp-webapi
        component: backend
        environment: dev
        version: "1.0"
    spec:
      containers:
      - name: webapi
        image: your-docker-hub-account/myapp-webapi:1.0
        ports:
        - containerPort: 8080
          name: http
          protocol: TCP
        env:
        - name: ASPNETCORE_ENVIRONMENT
          value: "Production"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi
  namespace: myapp
  labels:
    app: myapp-webapi
    component: backend
    environment: dev
spec:
  type: ClusterIP
  selector:
    app: myapp-webapi
  ports:
  - name: http
    port: 8080
    targetPort: 8080
    protocol: TCP
```

Aplicar:

```bash
kubectl apply -f all-in-one.yaml
```

---

## 10) Atualizar recursos com YAML

### 10.1 Alterar número de réplicas

Edite `deployment.yaml` e mude:

```yaml
spec:
  replicas: 3  # era 2, agora 3
```

Aplicar a mudança:

```bash
kubectl apply -f deployment.yaml
```

Verificar:

```bash
kubectl get pods -n myapp
```

Agora você terá **3 Pods**!

### 10.2 Alterar a imagem (simulando update de versão)

Vamos gerar (build) a nova versão (1.1) da imagem e enviá-la (push) ao Docker Hub.

No diretório do projeto (onde está o Dockerfile):

# build da imagem nova
docker build -t <docker-hub-account>/myapp-webapi:1.1 .

# push para o Docker Hub
docker push <docker-hub-account>/myapp-webapi:1.1

Se você já publicou uma versão `1.1` no Docker Hub, edite:

```yaml
spec:
  template:
    spec:
      containers:
      - name: webapi
        image: <docker-hub-account>/myapp-webapi:1.1  # era 1.0
```

Aplicar:

```bash
kubectl apply -f deployment.yaml
```

O Kubernetes fará um **rolling update** automaticamente: troca os Pods antigos pelos novos aos poucos, sem derrubar o app.

Acompanhar o rollout (o andamento dessa troca):

```bash
kubectl rollout status deployment/myapp-webapi -n myapp
```

### 10.3 Ver histórico de revisões

```bash
kubectl rollout history deployment/myapp-webapi -n myapp
```

### 10.4 Fazer rollback (voltar versão anterior)

```bash
kubectl rollout undo deployment/myapp-webapi -n myapp
```

---

## 11) Exportar recursos existentes para YAML

Se você criou recursos por comandos (como no módulo **Setup e primeiro deploy**) e quer gerar o YAML deles:

### 11.1 Exportar Deployment

```bash
kubectl get deployment myapp-webapi -n myapp -o yaml > deployment-exported.yaml
```

**Nota:** o arquivo exportado terá MUITA informação extra (status e metadata gerada pelo cluster). Apague essas partes antes de usar como manifest.

### 11.2 Exportar de forma limpa (dry-run)

```bash
kubectl create deployment myapp-webapi --image=tallesvaliatti/myapp-webapi:1.0 \
  --dry-run=client -o yaml > deployment-clean.yaml
```

O `--dry-run=client` faz um "ensaio": gera o YAML sem criar o recurso.

---

## 12) Boas práticas de Labels

**Por que isso importa:** labels padronizadas deixam fácil achar, filtrar e limpar recursos quando o projeto cresce.

### 12.1 Labels recomendadas

Labels comuns em projetos reais:

```yaml
labels:
  app: myapp-webapi              # nome da aplicação
  component: backend             # frontend/backend/database
  environment: dev               # dev/staging/prod
  version: "1.0"                 # versão do app
  tier: api                      # camada da aplicação
  managed-by: kubectl            # ferramenta de deploy
  team: backend-team             # time responsável
  project: kub-learn-flow          # projeto
```

### 12.2 Labels obrigatórias vs opcionais

**Obrigatórias** (para funcionamento):
- `app` - usada pelos selectors do Service e Deployment

**Recomendadas** (para organização):
- `component` - tipo de componente
- `environment` - ambiente
- `version` - versão

**Opcionais** (depende do projeto):
- `tier`, `team`, `project`, `managed-by`

### 12.3 Convenções de nomenclatura

- Use kebab-case (palavras minúsculas separadas por hífen): `backend-team` (não `backendTeam` ou `backend_team`)
- Valores devem ser strings: `version: "1.0"` (não `version: 1.0`)
- Máximo de 63 caracteres por label
- Use prefixos para labels customizadas: `mycompany.com/team: backend`

---

## 13) Explorar recursos por namespace

### 13.1 Ver recursos em todos os namespaces

```bash
kubectl get pods --all-namespaces
```

Ou:

```bash
kubectl get pods -A
```

Ver com namespace na saída:

```bash
kubectl get pods -A -o wide
```

### 13.2 Ver recursos de múltiplos tipos

```bash
kubectl get deployments,services,pods -n myapp
```

Ou:

```bash
kubectl get all -n myapp
```

### 13.3 Contar recursos

Contar Pods no namespace:

```bash
kubectl get pods -n myapp --no-headers | wc -l
```

---

## 14) Logs e Debug com namespaces e labels

### 14.1 Ver logs de todos os Pods de um Deployment

```bash
kubectl logs -n myapp -l app=myapp-webapi --tail=50
```

### 14.2 Ver logs de um Pod específico

```bash
kubectl logs -n myapp <pod-name>
```

### 14.3 Ver logs em tempo real

```bash
kubectl logs -n myapp -l app=myapp-webapi -f
```

### 14.4 Executar um comando dentro de um Pod

```bash
kubectl exec -n myapp <pod-name> -- env
```

Shell interativo:

```bash
kubectl exec -n myapp <pod-name> -it -- /bin/sh
```

---

## 15) Limpar recursos

### 15.1 Deletar por label

Deletar todos os recursos com label `app=myapp-webapi`:

```bash
kubectl delete all -n myapp -l app=myapp-webapi
```

### 15.2 Deletar usando os arquivos YAML

```bash
kubectl delete -f deployment.yaml
kubectl delete -f service.yaml
```

Ou toda a pasta:

```bash
kubectl delete -f .
```

### 15.3 Deletar o namespace inteiro

Isso deleta TUDO dentro do namespace:

```bash
kubectl delete namespace myapp
```

**Atenção:** Isso remove namespace + todos os recursos dentro dele!

Verificar:

```bash
kubectl get ns
```

---

## 16) Desligar o cluster Minikube

Quando terminar, é uma boa prática **parar o cluster** para economizar memória e CPU do seu computador.

### 16.1 Parar o cluster (recomendado)

```bash
minikube stop
```

Isso para o cluster, mas mantém todos os recursos (namespaces, deployments etc.). Quando você iniciar de novo com `minikube start`, tudo estará lá.

Verificar status:

```bash
minikube status
```

Esperado: `host: Stopped`