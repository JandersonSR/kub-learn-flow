# Projeto prático: juntando tudo

**O que você vai aprender:** a usar, **num único fluxo do zero ao app funcionando**, tudo o que viu nos módulos anteriores: subir o cluster, publicar as imagens, organizar tudo num namespace com labels, configurar o app com ConfigMap e Secret, rodar com réplicas e health checks, conectar os serviços, expor por uma URL amigável com Ingress, escalar, atualizar de versão, voltar atrás (rollback), mudar configuração e diagnosticar problemas.

**Entregável:** a loja de exemplo (`MyApp.WebApp` + `MyApp.WebApi`) rodando no namespace `projeto-pratico`, acessível em `http://myapp.local` (site) e `http://myapp.local/api/products` (API), com desconto vindo de um ConfigMap e a URL da API vinda de um Secret.

---

## Pré-requisitos

Este módulo **não traz nada novo**: ele só junta as peças. Se algum comando parecer estranho, volte ao módulo indicado em "**Você usa aqui**".

✅ **Ferramentas instaladas** (módulo "Setup e primeiro deploy"): Docker Desktop, `kubectl` e `minikube`.

```bash
docker --version
kubectl version --client
minikube version
```

✅ **Conta no Docker Hub** e login feito:

```bash
docker login
```

✅ **`jq` instalado** (opcional, só para deixar o JSON legível). Veja como instalar no módulo "ConfigMaps e Secrets".

✅ **Os Apps do módulo 06** no seu computador, em `Modulos/06-ConfigMaps-e-Secrets/Apps/` (vamos reaproveitá-los, sem mudar nenhuma linha de código).

💡 Em todo este módulo, troque `<docker-hub-account>` pelo **seu usuário do Docker Hub** (ex.: `tallesvaliatti`).

---

## O que vamos praticar

| Módulo | O que você usa dele aqui |
|---|---|
| 01 - Setup e primeiro deploy | `minikube start`, `docker build`/`push`, `kubectl get`/`describe`/`logs` |
| 02 - YAML, Namespaces e Labels | Manifests YAML, namespace próprio, labels, filtros com `-l`, `kubectl apply -f` |
| 03 - Deployments: scale, rollout e rollback | Réplicas, `kubectl scale`, `set image`, `rollout status`/`history`/`undo`, RollingUpdate, health checks |
| 04 - Services (ClusterIP e NodePort) | Services ClusterIP, DNS interno (`<service>.<namespace>.svc.cluster.local`), Web → API |
| 05 - Ingress | Addon `ingress` do Minikube, Ingress com host `myapp.local` e paths `/` e `/api` |
| 06 - ConfigMaps e Secrets | Desconto via ConfigMap (`envFrom`), URL da API via Secret (`secretKeyRef`), `rollout restart` |

**Como tudo se conecta:**

```
Navegador / curl
    ↓  http://myapp.local
Ingress Controller (NGINX)            ← módulo 05
    ↓  /      → myapp-webapp-service
    ↓  /api   → myapp-webapi-service
Services ClusterIP                     ← módulo 04
    ↓
Pods do WebApp (2)  ──(URL do Secret)──→  Pods da WebApi (3, desconto do ConfigMap)
                                           ← módulos 03 e 06
Tudo dentro do namespace projeto-pratico   ← módulo 02
```

**Arquivos deste módulo** (todos na pasta `Modulos/07-Projeto-Pratico/`):

| Arquivo | O que cria |
|---|---|
| `namespace.yaml` | Namespace `projeto-pratico` |
| `configmap.yaml` | ConfigMap `myapp-webapi-config` (desconto) |
| `secret.yaml` | Secret `myapp-webapp-secret` (URL da API) |
| `deployment-webapi.yaml` | Deployment `myapp-webapi` (3 réplicas) |
| `deployment-webapp.yaml` | Deployment `myapp-webapp` (2 réplicas) |
| `services.yaml` | Services ClusterIP `myapp-webapi-service` e `myapp-webapp-service` |
| `ingress.yaml` | Ingress `myapp-ingress` (host `myapp.local`) |
| `all-in-one.yaml` | Tudo acima num arquivo só |

---

## 1) Subir o cluster e habilitar o Ingress

**Você usa aqui:** módulo 01 (Minikube) e módulo 05 (addon de Ingress)

Primeiro, ligamos o "computador do Kubernetes" (o cluster local) e o "recepcionista" que vai receber as visitas (o Ingress Controller).

```bash
minikube start --driver=docker
minikube status
kubectl get nodes
```

Esperado: 1 node com status `Ready`.

```bash
minikube addons enable ingress
kubectl get pods -n ingress-nginx
```

Esperado: o Pod `ingress-nginx-controller-...` com status `Running` (os Pods `admission` ficam `Completed`, e está tudo certo).

⚠️ **Sobrou algo do módulo 05?** Se o namespace `ingress-lab` ainda existir, o Ingress dele também usa o host `myapp.local` e vai brigar com o nosso. Remova antes de seguir:

```bash
kubectl get namespaces
kubectl delete namespace ingress-lab
```

(Se ele não existir, o `delete` só mostra um erro "not found", e pode ignorar.)

---

## 2) Build e push das imagens

**Você usa aqui:** módulo 01 (Docker build/push) e módulo 06 (as versões `webapi:5.0` e `webapp:3.0`)

O Kubernetes não roda código-fonte, ele roda **imagens**. Vamos reaproveitar os apps do módulo 06, que já leem o desconto e a URL da API pela configuração.

Se você **já fez o push** dessas imagens no módulo 06, pode pular este passo.

### 2.1) API (MyApp.WebApi v5.0)

```bash
cd Modulos/06-ConfigMaps-e-Secrets/Apps/MyApp.WebApi

docker build -t <docker-hub-account>/myapp-webapi:5.0 .
docker push <docker-hub-account>/myapp-webapi:5.0
```

### 2.2) Site (MyApp.WebApp v3.0)

```bash
cd ../MyApp.WebApp

docker build -t <docker-hub-account>/myapp-webapp:3.0 .
docker push <docker-hub-account>/myapp-webapp:3.0
```

### 2.3) Já deixe pronta uma "versão nova" para o passo 9

Assim como no módulo 03, vamos só criar uma nova tag a partir da mesma imagem, para simular uma atualização:

```bash
docker tag <docker-hub-account>/myapp-webapi:5.0 <docker-hub-account>/myapp-webapi:5.1
docker push <docker-hub-account>/myapp-webapi:5.1
```

### 2.4) Colocar seu usuário nos YAMLs

Os YAMLs deste módulo usam o texto `<docker-hub-account>`. Troque pelo seu usuário. Você pode editar os arquivos à mão ou usar:

```bash
cd ../../../07-Projeto-Pratico

# Linux / Git Bash (Windows)
sed -i 's/<docker-hub-account>/SEU_USUARIO/g' *.yaml

# macOS
sed -i '' 's/<docker-hub-account>/SEU_USUARIO/g' *.yaml
```

Confira:

```bash
grep "image:" *.yaml
```

A partir daqui, **todos os comandos rodam dentro de `Modulos/07-Projeto-Pratico`**.

---

## 3) Namespace próprio com labels

**Você usa aqui:** módulo 02 (Namespaces e Labels)

Um **namespace** é uma "pasta" dentro do cluster: tudo do projeto fica junto e, no fim, dá para apagar tudo de uma vez. As **labels** são etiquetas que ajudam a encontrar as coisas.

### namespace.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: projeto-pratico
  labels:
    name: projeto-pratico
    purpose: projeto-final
    environment: dev
```

```bash
kubectl apply -f namespace.yaml
kubectl get ns projeto-pratico --show-labels
```

💡 Dica do módulo 02: para não digitar `-n projeto-pratico` toda hora, você pode deixar este namespace como padrão. Neste módulo vamos manter o `-n` em todos os comandos, para ficar claro onde cada coisa está.

```bash
kubectl config set-context --current --namespace=projeto-pratico
```

(Para voltar: `kubectl config set-context --current --namespace=default`.)

---

## 4) ConfigMap e Secret

**Você usa aqui:** módulo 06 (ConfigMaps e Secrets)

- **ConfigMap** guarda configuração comum (aqui, o percentual de desconto).
- **Secret** guarda dados sensíveis (aqui, a URL interna da API). Lembre: Secret é **base64, não criptografia**.

Repare que a URL da API agora termina em `projeto-pratico.svc.cluster.local`: é o **DNS interno** do Kubernetes (módulo 04), no formato `<service>.<namespace>.svc.cluster.local`.

### configmap.yaml

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-webapi-config
  namespace: projeto-pratico
  labels:
    app: myapp-webapi
data:
  # Desconto (%) aplicado a todos os produtos pela MyApp.WebApi.
  # Sem esta chave, a API usa 0% (valor nullable).
  Discount__Percentage: "10"
```

### secret.yaml

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-webapp-secret
  namespace: projeto-pratico
  labels:
    app: myapp-webapp
type: Opaque
stringData:
  # Guardado em base64 (NAO e criptografia) no cluster.
  ApiSettings__WebApiUrl: "http://myapp-webapi-service.projeto-pratico.svc.cluster.local"
```

```bash
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
```

**Verificar:**

```bash
kubectl get configmap,secret -n projeto-pratico
kubectl get configmap myapp-webapi-config -n projeto-pratico -o yaml
```

Prove que o Secret é só base64 (qualquer um com acesso consegue ler):

```bash
kubectl get secret myapp-webapp-secret -n projeto-pratico -o jsonpath='{.data.ApiSettings__WebApiUrl}' | base64 --decode
```

💡 O nome `Discount__Percentage` usa `__` (dois sublinhados) porque é assim que o .NET entende `Discount:Percentage` vindo de variável de ambiente.

---

## 5) Deployments com réplicas e health checks

**Você usa aqui:** módulo 03 (réplicas, RollingUpdate, health checks) e módulo 06 (`envFrom` e `secretKeyRef`)

O **Deployment** é quem garante que sempre existam N cópias (réplicas) do app rodando. Se uma cair, ele cria outra.

### deployment-webapi.yaml (API)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapi
  namespace: projeto-pratico
  labels:
    app: myapp-webapi
    tier: backend
spec:
  replicas: 3
  revisionHistoryLimit: 10
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
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
        image: <docker-hub-account>/myapp-webapi:5.0
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

O que cada parte faz, em linguagem simples:

- `replicas: 3`: três cópias da API rodando ao mesmo tempo.
- `strategy: RollingUpdate` com `maxSurge: 1` e `maxUnavailable: 0` (módulo 03): na atualização, sobe **uma cópia nova por vez** e só derruba uma antiga quando a nova estiver pronta. Resultado: **zero downtime**.
- `envFrom.configMapRef`: joga **todas** as chaves do ConfigMap como variáveis de ambiente (aqui, o desconto).
- `readinessProbe`: "você já está pronto para receber visitas?". Se não estiver, o Service não manda tráfego para esse Pod.
- `livenessProbe`: "você ainda está vivo?". Se falhar várias vezes, o Kubernetes reinicia o container.
- `resources`: quanto de memória/CPU o Pod pede e o máximo que pode usar.

### deployment-webapp.yaml (site)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-webapp
  namespace: projeto-pratico
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
        image: <docker-hub-account>/myapp-webapp:3.0
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

`valueFrom.secretKeyRef` pega **só uma chave** do Secret e coloca numa variável de ambiente. É assim que o site descobre onde está a API, sem mudar código.

```bash
kubectl apply -f deployment-webapi.yaml
kubectl apply -f deployment-webapp.yaml
```

Acompanhe os Pods nascendo (saia com `Ctrl+C`):

```bash
kubectl get pods -n projeto-pratico -w
```

Esperado: 3 Pods `myapp-webapi-...` e 2 Pods `myapp-webapp-...`, todos `Running` e `READY 1/1`.

Use as labels para filtrar (módulo 02):

```bash
kubectl get pods -n projeto-pratico -l tier=backend
kubectl get pods -n projeto-pratico -l tier=frontend
kubectl get pods -n projeto-pratico -L app,tier
```

---

## 6) Services ClusterIP

**Você usa aqui:** módulo 04 (Services ClusterIP)

Os Pods nascem e morrem, e cada um ganha um IP diferente. O **Service** é um "endereço fixo" que sempre aponta para os Pods certos (escolhidos pela label `app`) e divide as requisições entre eles. Usamos **ClusterIP** (só acessível dentro do cluster), porque quem fala com o mundo de fora é o Ingress.

### services.yaml

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi-service
  namespace: projeto-pratico
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
  name: myapp-webapp-service
  namespace: projeto-pratico
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

O `---` separa dois recursos dentro do mesmo arquivo (módulo 02).

```bash
kubectl apply -f services.yaml
kubectl get svc -n projeto-pratico
```

Veja quais Pods estão "atrás" de cada Service:

```bash
kubectl get endpointslices -n projeto-pratico -l kubernetes.io/service-name=myapp-webapi-service
```

Esperado: 3 endereços (um por réplica da API).

---

## 7) Ingress com host e path

**Você usa aqui:** módulo 05 (Ingress combinando host + path)

O **Ingress** é o recepcionista: recebe tudo em `myapp.local` e encaminha:

- `myapp.local/` → site (`myapp-webapp-service`)
- `myapp.local/api/...` → API (`myapp-webapi-service`)

Não precisa de rewrite: a API v5.0 já usa `UsePathBase("/api")` (módulo 05), então ela espera receber o caminho com `/api`.

### ingress.yaml

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  namespace: projeto-pratico
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

```bash
kubectl apply -f ingress.yaml
kubectl get ingress -n projeto-pratico
kubectl describe ingress myapp-ingress -n projeto-pratico
```

Esperado: `HOSTS` = `myapp.local` e, depois de alguns segundos, um `ADDRESS` preenchido (ex.: `192.168.49.2`).

### 7.1) Fazer `myapp.local` apontar para o cluster

Seu computador precisa saber que `myapp.local` é o Minikube. Escolha a opção do seu ambiente (são as mesmas do módulo 05). Se você já fez isso no módulo 05, a linha no arquivo `hosts` continua valendo.

**Opção 1: IP do Minikube (Linux/Windows ou VM)**

```bash
minikube ip
MINIKUBE_IP=$(minikube ip)
echo "${MINIKUBE_IP} myapp.local" | sudo tee -a /etc/hosts
```

No Windows, o arquivo é `C:\Windows\System32\drivers\etc\hosts` (abra o editor como Administrador e adicione a linha `<ip-do-minikube> myapp.local`).

**Opção 2: túnel do Minikube (macOS + Docker driver)**

```bash
echo "127.0.0.1 myapp.local" | sudo tee -a /etc/hosts

# Em um terminal separado (deixe aberto!)
minikube service -n ingress-nginx ingress-nginx-controller
```

Anote a porta que aparecer para `http/80` (ex.: `65113`) e use-a nas URLs: `http://myapp.local:65113/`.

💡 **Sem mexer no `hosts`**, dá para testar só com `curl`, mandando o header `Host`:

```bash
INGRESS_URL=$(minikube service -n ingress-nginx ingress-nginx-controller --url | head -n 1)
curl -H "Host: myapp.local" $INGRESS_URL/api/health
```

---

## 8) Testar o app funcionando

**Você usa aqui:** módulos 04, 05 e 06

Os exemplos abaixo usam a **Opção 1** (sem porta). Na Opção 2, acrescente `:<porta-do-tunel>` depois de `myapp.local`.

### 8.1) API pelo Ingress

```bash
curl http://myapp.local/api/health
curl -s http://myapp.local/api/products | jq .
```

**Saída esperada (resumida):** o desconto de 10% do ConfigMap aplicado.

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

### 8.2) Ver o balanceamento entre réplicas

Chame o endpoint de instância algumas vezes. O `hostname` é o nome do Pod que respondeu: ele deve variar entre as 3 réplicas.

```bash
for i in 1 2 3 4 5 6; do curl -s http://myapp.local/api/instance; echo; done
```

### 8.3) Site no navegador

Abra **http://myapp.local** e clique em:

- **"Listar Produtos"**: os produtos aparecem com o preço original riscado, o selo `-10%` e o preço final.
- **"Chamar API de Instância"**: mostra qual Pod da API respondeu.

Se isso funcionou, o caminho completo está de pé: **navegador → Ingress → Service do site → Pod do site → (URL do Secret) → Service da API → Pod da API (desconto do ConfigMap)**. 🎉

---

## 9) Escalar

**Você usa aqui:** módulo 03 (`kubectl scale`)

Chegou muita gente na loja? Aumente o número de cópias da API:

```bash
kubectl scale deployment myapp-webapi --replicas=5 -n projeto-pratico
kubectl get pods -n projeto-pratico -l app=myapp-webapi
```

Repita o teste do passo 8.2: agora aparecem até 5 `hostname` diferentes. O Service já incluiu as réplicas novas sozinho.

Diminua o site para 1 cópia e depois volte:

```bash
kubectl scale deployment myapp-webapp --replicas=1 -n projeto-pratico
kubectl get deployments -n projeto-pratico
```

Voltar para o que está nos YAMLs (forma **declarativa**, a recomendada):

```bash
kubectl apply -f deployment-webapi.yaml
kubectl apply -f deployment-webapp.yaml
kubectl get deployments -n projeto-pratico
```

Esperado: `myapp-webapi 3/3` e `myapp-webapp 2/2`.

💡 O `kubectl scale` é ótimo para um ajuste rápido, mas o que vale "de verdade" é o YAML: o próximo `apply` volta ao número que está no arquivo.

---

## 10) Rollout de uma nova versão e rollback

**Você usa aqui:** módulo 03 (`set image`, `rollout status`, `history`, `undo`)

### 10.1) Publicar a versão 5.1

Em um terminal, deixe os Pods sendo observados:

```bash
kubectl get pods -n projeto-pratico -l app=myapp-webapi -w
```

Em outro terminal, troque a imagem (o nome `webapi` é o nome do container no YAML):

```bash
kubectl set image deployment/myapp-webapi webapi=<docker-hub-account>/myapp-webapi:5.1 -n projeto-pratico
kubectl annotate deployment/myapp-webapi kubernetes.io/change-cause="Atualiza para 5.1" -n projeto-pratico
kubectl rollout status deployment/myapp-webapi -n projeto-pratico
```

No primeiro terminal você vê o **RollingUpdate**: um Pod novo sobe, fica pronto (readiness), e só então um antigo é desligado. Enquanto isso, `curl http://myapp.local/api/products` continua respondendo.

```bash
kubectl rollout history deployment/myapp-webapi -n projeto-pratico
kubectl describe deployment myapp-webapi -n projeto-pratico | grep Image
```

### 10.2) Voltar atrás (rollback)

Imagine que a 5.1 deu problema. Volte para a versão anterior:

```bash
kubectl rollout undo deployment/myapp-webapi -n projeto-pratico
kubectl rollout status deployment/myapp-webapi -n projeto-pratico
kubectl describe deployment myapp-webapi -n projeto-pratico | grep Image
```

Esperado: a imagem volta para `...myapp-webapi:5.0`.

(Opcional) Para voltar a uma revisão específica, veja o número no `history` e use `--to-revision`. Se a revisão escolhida for igual à que já está rodando, o Kubernetes só avisa que não há nada a fazer:

```bash
kubectl rollout history deployment/myapp-webapi -n projeto-pratico
kubectl rollout undo deployment/myapp-webapi --to-revision=1 -n projeto-pratico
```

💡 O `set image` é imperativo (muda só o cluster). No dia a dia, prefira editar a imagem no `deployment-webapi.yaml` e rodar `kubectl apply -f deployment-webapi.yaml`, assim o Git sempre mostra a versão que está rodando.

---

## 11) Mudar uma configuração (ConfigMap) e reiniciar

**Você usa aqui:** módulo 06 (ConfigMap via variável de ambiente + `rollout restart`)

Vamos mudar o desconto de 10% para 20%, **sem rebuild de imagem**.

```bash
kubectl patch configmap myapp-webapi-config -n projeto-pratico --type merge -p '{"data":{"Discount__Percentage":"20"}}'
curl -s http://myapp.local/api/products | jq '.[0]'
```

☝️ Ainda aparece **10%**. A API lê o desconto **só quando inicia**, e os Pods atuais já tinham iniciado.

Reinicie os Pods da API (um por vez, sem derrubar o app):

```bash
kubectl rollout restart deployment/myapp-webapi -n projeto-pratico
kubectl rollout status deployment/myapp-webapi -n projeto-pratico
curl -s http://myapp.local/api/products | jq '.[0]'
```

✅ Agora aparece **20%**. Atualize o site no navegador e veja o selo `-20%`.

💡 Diferente do módulo 06, aqui **não precisa refazer port-forward**: o Ingress sempre encaminha para os Pods novos através do Service.

Confira a variável dentro de um Pod (módulo 02, `kubectl exec`):

```bash
kubectl get pods -n projeto-pratico -l app=myapp-webapi
kubectl exec -n projeto-pratico <nome-do-pod> -- env | grep Discount
```

**Voltar ao valor do arquivo** (10%):

```bash
kubectl apply -f configmap.yaml
kubectl rollout restart deployment/myapp-webapi -n projeto-pratico
```

---

## 12) Diagnóstico rápido

**Você usa aqui:** módulos 01, 02 e 03 (`get`, `describe`, `logs`, `exec`, eventos)

Quando algo não funciona, siga sempre a mesma ordem: **ver → detalhar → ler logs**.

| Pergunta | Comando |
|---|---|
| O que está rodando? | `kubectl get all -n projeto-pratico` |
| Os Pods estão prontos? | `kubectl get pods -n projeto-pratico -o wide` |
| Por que este Pod não sobe? (veja a seção `Events` no fim) | `kubectl describe pod <nome-do-pod> -n projeto-pratico` |
| O que o app está dizendo? | `kubectl logs -n projeto-pratico -l app=myapp-webapi --tail=20` |
| O Service tem Pods atrás dele? | `kubectl get endpointslices -n projeto-pratico` |
| O Ingress está apontando certo? | `kubectl describe ingress myapp-ingress -n projeto-pratico` |
| O Ingress Controller recebeu a requisição? | `kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=20` |

### 12.1) Treino: provocar um erro e resolver

Vamos publicar, de propósito, uma imagem que **não existe**:

```bash
kubectl set image deployment/myapp-webapi webapi=<docker-hub-account>/myapp-webapi:9.9 -n projeto-pratico
kubectl get pods -n projeto-pratico -l app=myapp-webapi
```

Você verá um Pod novo com status `ErrImagePull` ou `ImagePullBackOff` (o Kubernetes não conseguiu baixar a imagem). Repare que **os 3 Pods antigos continuam `Running`**: graças ao `maxUnavailable: 0` e ao readiness, o app nem saiu do ar.

```bash
curl http://myapp.local/api/health
```

Descubra o motivo na seção `Events`:

```bash
kubectl describe pod <nome-do-pod-com-erro> -n projeto-pratico
```

Algo como: `Failed to pull image ".../myapp-webapi:9.9" ... not found`.

Resolva com rollback:

```bash
kubectl rollout undo deployment/myapp-webapi -n projeto-pratico
kubectl rollout status deployment/myapp-webapi -n projeto-pratico
kubectl get pods -n projeto-pratico -l app=myapp-webapi
```

💡 **Dica extra** (não usada nos módulos anteriores, mas útil): para ver todos os eventos do namespace de uma vez, em ordem de tempo:

```bash
kubectl get events -n projeto-pratico --sort-by=.metadata.creationTimestamp
```

---

## 13) Atalho: tudo de uma vez (all-in-one)

**Você usa aqui:** módulo 02 (vários recursos num só arquivo)

O `all-in-one.yaml` junta, na ordem certa, namespace, ConfigMap, Secret, Deployments, Services e Ingress. É útil para recriar o projeto inteiro depois que você já entendeu cada peça.

```bash
kubectl apply -f all-in-one.yaml
kubectl get all,configmap,secret,ingress -n projeto-pratico
```

Outra forma é aplicar a pasta inteira (módulo 02). Como o `all-in-one.yaml` repete os mesmos recursos, não faz mal, o `apply` só confirma o que já existe:

```bash
kubectl apply -f .
```

---

## 14) Limpeza

**Você usa aqui:** módulos 02, 05 e 01

Apagar tudo do projeto (o namespace leva junto tudo o que está dentro dele):

```bash
kubectl delete -f all-in-one.yaml
# ou
kubectl delete namespace projeto-pratico
```

Verificar:

```bash
kubectl get all -n projeto-pratico
kubectl get ns
```

Se você mudou o namespace padrão no passo 3, volte para o `default`:

```bash
kubectl config set-context --current --namespace=default
```

Remova a linha `myapp.local` do arquivo `hosts` (`/etc/hosts` no Linux/macOS, `C:\Windows\System32\drivers\etc\hosts` no Windows):

```bash
sudo nano /etc/hosts
```

Opcional: desligar o Ingress e parar o cluster (os dados do cluster ficam guardados para o próximo `minikube start`):

```bash
minikube addons disable ingress
minikube stop
```

---

## Checklist do que você domina

Marque o que você conseguiu fazer sozinho neste projeto:

- [ ] Subir o Minikube, conferir o node e habilitar o addon de Ingress (módulos 01 e 05)
- [ ] Gerar e publicar imagens no Docker Hub, incluindo uma nova tag (módulos 01 e 03)
- [ ] Escrever e aplicar manifests YAML com `kubectl apply -f` (módulo 02)
- [ ] Criar um namespace próprio e filtrar recursos por labels (módulo 02)
- [ ] Configurar o app com ConfigMap (`envFrom`) e Secret (`secretKeyRef`) e explicar por que Secret não é criptografia (módulo 06)
- [ ] Rodar Deployments com réplicas, RollingUpdate e readiness/liveness probes (módulo 03)
- [ ] Conectar site → API pelo DNS interno usando Services ClusterIP (módulo 04)
- [ ] Expor o site e a API por um único host com paths `/` e `/api` no Ingress (módulo 05)
- [ ] Escalar com `kubectl scale` e voltar ao estado do YAML com `apply` (módulo 03)
- [ ] Atualizar de versão, acompanhar o rollout e fazer rollback (módulo 03)
- [ ] Mudar uma configuração e aplicá-la com `kubectl rollout restart` (módulo 06)
- [ ] Diagnosticar um Pod com problema usando `get`, `describe` (Events) e `logs` (módulos 01, 02 e 03)
- [ ] Limpar tudo apagando o namespace (módulo 02)

---

## Próximos passos

Assuntos que **não foram cobertos** nos módulos 01–06 e são a continuação natural (citados no README do curso):

- **Health checks avançados e recursos** (`requests`/`limits` em detalhe)
- **Autoscaling (HPA)**: escalar automaticamente conforme a carga, em vez do `kubectl scale` manual
- **Persistência (PVC)** e um app com estado (ex.: Postgres)
- **ConfigMap/Secret como volume** (arquivos), em vez de variáveis de ambiente
- **Operação do dia a dia** com k9s e padrões de diagnóstico
- **AKS**: levar este mesmo projeto do Minikube para a Azure, com LoadBalancer, Ingress na nuvem e CI/CD
