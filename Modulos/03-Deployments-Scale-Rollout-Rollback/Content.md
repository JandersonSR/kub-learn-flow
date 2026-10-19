# Deployments: scale, rollout e rollback

**O que você vai aprender:** usar **Deployments** no Kubernetes. Um Deployment é o "gerente" que mantém sua aplicação rodando do jeito que você pediu. Você vai **escalar réplicas** (réplica = uma cópia da aplicação rodando; escalar = aumentar ou diminuir essas cópias), fazer **rollout de novas versões** (trocar a versão aos poucos), acompanhar o **status das atualizações** e fazer **rollback** (voltar para a versão anterior) quando algo der errado.

**Entregável:** entender, passo a passo, como "publicar uma versão nova com segurança" usando estratégias de deployment.

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

Você vai precisar de uma conta no Docker Hub (um "depósito" online de imagens Docker) para fazer push (enviar) da imagem. Se não tiver:
- Criar conta em: https://hub.docker.com
- Fazer login local: `docker login`

---

## O que vamos aprender

1. **Escalar réplicas** - aumentar ou diminuir o número de pods para aguentar mais ou menos acessos
2. **Estratégias de rollout** - RollingUpdate (troca aos poucos) vs Recreate (desliga tudo e sobe de novo)
3. **Atualizar imagem** - publicar nova versão com zero downtime (sem a aplicação sair do ar)
4. **Acompanhar rollout** - monitorar status da atualização
5. **Rollback** - reverter para versão anterior em caso de problema
6. **Health checks** - verificações de saúde (readiness e liveness probes)
7. **Load balancing** - testar como as requisições são divididas entre os pods

---

## 1) Novo endpoint para visualizar instâncias

Neste módulo, a aplicação ganhou um novo endpoint (um endereço da API) `/instance`. Ele retorna:
- **instanceId**: identificador único gerado no startup
- **hostname**: nome do pod
- **startupTime**: quando o pod iniciou
- **uptime**: há quanto tempo está rodando

Com isso, dá para **ver o load balancing** acontecendo. Load balancing é dividir os pedidos entre várias cópias, como vários caixas atendendo uma mesma fila. Cada resposta pode vir de um pod diferente.

### Implementação no Program.cs

O código já está implementado em `Apps/MyApp.WebApi/Program.cs`:

```csharp
// Instance information (generated at startup)
var instanceId = Guid.NewGuid().ToString("N")[..8]; // First 8 chars of GUID
var hostname = Environment.MachineName;
var startupTime = DateTime.UtcNow;

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

record InstanceInfo(string InstanceId, string Hostname, DateTime StartupTime, string Uptime);
```

**Este endpoint é a novidade da versão 2.0!** 🚀

### Testar localmente (opcional)

Se quiser testar a aplicação antes de fazer o build:

```bash
cd Modulos/03-Deployments-Scale-Rollout-Rollback/Apps/MyApp.WebApi
dotnet run
```

Em outro terminal:

```bash
# Testar o novo endpoint
curl http://localhost:5023/instance
```

---

## 2) Build e push da nova versão (2.0)

Agora vamos criar a imagem Docker **versão 2.0**, que já traz o novo endpoint `/instance`.

### 2.1) Build da nova imagem

```bash
cd Modulos/03-Deployments-Scale-Rollout-Rollback/Apps/MyApp.WebApi
docker build -t <seu-docker-hub-account>/myapp-webapi:2.0 .
```

**Substitua** `<seu-docker-hub-account>` pelo seu usuário do Docker Hub.

**Importante:** Esta versão 2.0 inclui:
- ✅ Endpoint `/products` (já existente)
- ✅ Endpoint `/products/{id}` (já existente)
- ✅ **Novo:** Endpoint `/instance` (para visualizar load balancing)

### 2.2) Push para Docker Hub

```bash
docker push <seu-docker-hub-account>/myapp-webapi:2.0
```

### 2.3) Verificar imagem

```bash
docker images | grep myapp-webapi
```

Esperado: ver as versões `1.0`, `1.1` e `2.0`.

---

## 3) Criar namespace myapp

Vamos começar do zero! Primeiro, crie o namespace onde a aplicação vai rodar:

### 3.1) Verificar se já existe

```bash
kubectl get namespaces
```

Se o namespace `myapp` já existir dos módulos anteriores, apague-o para começar limpo:

```bash
# Deletar namespace (isso remove TODOS os recursos dentro dele)
kubectl delete namespace myapp
```

### 3.2) Criar novo namespace

```bash
cd Modulos/03-Deployments-Scale-Rollout-Rollback

kubectl apply -f namespace.yaml
```

### 3.3) Verificar criação

```bash
kubectl get namespace myapp
```

Esperado:
```
NAME    STATUS   AGE
myapp   Active   5s
```

### 3.4) Ver detalhes do namespace

```bash
kubectl describe namespace myapp
```

Você verá as labels que definimos:
- `name: myapp`
- `environment: production`

### 3.5) Confirmar que está vazio

```bash
kubectl get all -n myapp
```

Esperado: `No resources found in myapp namespace.`

Perfeito! Agora temos um namespace limpo para trabalhar. 🎯

---

## 4) Criar Deployment com 3 réplicas

### 4.1) Entender o deployment.yaml

**Por que isso importa:** o `deployment.yaml` define quantas cópias rodam e como a troca de versão acontece.

Abra `Modulos/03-Deployments-Scale-Rollout-Rollback/deployment.yaml` e veja as configurações principais:

```yaml
spec:
  replicas: 3  # Número inicial de pods
  
  strategy:
    type: RollingUpdate  # Estratégia de atualização
    rollingUpdate:
      maxSurge: 1         # Pode criar 1 pod extra durante update
      maxUnavailable: 0   # Nenhum pod pode ficar indisponível
```

**RollingUpdate** é a estratégia que troca os pods aos poucos, um de cada vez, como trocar os pneus de um carro um por um sem parar a viagem. Ela garante:
- ✅ Zero downtime durante atualizações
- ✅ Rollout gradual (pod por pod)
- ✅ Possibilidade de rollback

**Health checks** adicionados. São verificações de saúde: o Kubernetes "bate na porta" da aplicação de tempos em tempos para ver se ela responde. Cada verificação é chamada de **probe** (sonda):

```yaml
livenessProbe:   # Verifica se o pod está vivo
  httpGet:
    path: /products
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:  # Verifica se o pod está pronto para receber tráfego
  httpGet:
    path: /products
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

### 4.2) Aplicar o deployment

**IMPORTANTE:** Antes de aplicar, edite o arquivo `deployment.yaml` e substitua `<docker-hub-account>` pelo seu usuário do Docker Hub!

```bash
cd Modulos/03-Deployments-Scale-Rollout-Rollback

# Aplicar deployment
kubectl apply -f deployment.yaml
```

### 4.3) Verificar criação dos pods

```bash
kubectl get pods -n myapp -w
```

O `-w` (watch, "observar") mostra as mudanças em tempo real.

Esperado: ver 3 pods sendo criados:
```
NAME                             READY   STATUS              RESTARTS   AGE
myapp-webapi-xxxxxxxxxx-xxxxx    0/1     ContainerCreating   0          2s
myapp-webapi-xxxxxxxxxx-xxxxx    0/1     ContainerCreating   0          2s
myapp-webapi-xxxxxxxxxx-xxxxx    0/1     ContainerCreating   0          2s
...
myapp-webapi-xxxxxxxxxx-xxxxx    1/1     Running             0          15s
myapp-webapi-xxxxxxxxxx-xxxxx    1/1     Running             0          15s
myapp-webapi-xxxxxxxxxx-xxxxx    1/1     Running             0          15s
```

**Pressione Ctrl+C** para sair do watch.

### 4.4) Verificar deployment

```bash
kubectl get deployment -n myapp
```

Esperado:
```
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
myapp-webapi   3/3     3            3           1m
```

- **READY**: 3/3 = 3 pods prontos de 3 desejados
- **UP-TO-DATE**: 3 pods na versão mais recente
- **AVAILABLE**: 3 pods disponíveis para receber tráfego

---

## 5) Criar Service para expor a aplicação

### 5.1) Entender o service.yaml

Abra `Modulos/03-Deployments-Scale-Rollout-Rollback/service.yaml` e veja:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-webapi
  namespace: myapp
spec:
  selector:
    app: myapp-webapi  # Seleciona pods com este label
  ports:
    - protocol: TCP
      port: 8080        # Porta do Service
      targetPort: 8080  # Porta do container
  type: ClusterIP       # Acesso interno ao cluster
```

O Service funciona como um **load balancer interno**: ele recebe as requisições e divide entre os 3 pods.

### 5.2) Aplicar o Service

```bash
kubectl apply -f service.yaml
```

### 5.3) Verificar Service

```bash
kubectl get service -n myapp
```

Esperado:
```
NAME           TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE
myapp-webapi   ClusterIP   10.96.xxx.xxx    <none>        8080/TCP   5s
```

### 5.4) Ver detalhes

```bash
kubectl describe service myapp-webapi -n myapp
```

Veja a seção **Endpoints**: ela deve listar os IPs dos 3 pods!

---
## 6) Testar load balancing entre réplicas (dentro do cluster)

### 6.1) Criar um Pod temporário com curl

Rode um pod descartável (que é apagado ao sair) no mesmo namespace e entre nele:

```bash
kubectl run curl-tmp -n myapp --rm -it --restart=Never --image=curlimages/curl:8.5.0 -- sh
```

### 6.2) Fazer múltiplas requisições para o Service

Dentro do pod, rode o comando abaixo várias vezes para ver o load balancing em ação:

```sh
curl -s http://myapp-webapi:8080/instance
```

**Resultado esperado:** os valores de `instanceId` e/ou `hostname` vão mudar entre uma chamada e outra. Isso mostra que o Service está dividindo as requisições entre as réplicas.

### 6.3) Sair

Quando terminar:

```sh
exit
```

---

## 7) Escalar réplicas

**Por que isso importa:** escalar (scale) é mudar o número de cópias da aplicação. Mais cópias aguentam mais acessos; menos cópias gastam menos recursos.

### 7.1) Escalar para 5 réplicas (imperativo: por comando direto)

```bash
kubectl scale deployment myapp-webapi --replicas=5 -n myapp
```

### 7.2) Acompanhar escalamento

```bash
kubectl get pods -n myapp -w
```

Você verá 2 novos pods sendo criados.

**Pressione Ctrl+C** para sair.

### 7.3) Verificar deployment

```bash
kubectl get deployment -n myapp
```

Esperado: `READY: 5/5`

### 7.4) Escalar para baixo

```bash
kubectl scale deployment myapp-webapi --replicas=2 -n myapp
```

Verificar:

```bash
kubectl get pods -n myapp
```

Você verá que 3 pods foram **terminados** e apenas 2 permanecem.

### 7.5) Voltar para 3 réplicas (declarativo)

A forma **recomendada** é a declarativa: você escreve no YAML como quer que fique e aplica:

```bash
# Edite deployment.yaml e mude replicas: 3
kubectl apply -f deployment.yaml
```

Ou use:

```bash
kubectl scale deployment myapp-webapi --replicas=3 -n myapp
```

---

## 8) Rollout de nova versão (2.0 → 2.1)

**Por que isso importa:** é assim que você publica uma versão nova sem tirar a aplicação do ar.

Agora vamos simular uma atualização, trocando a versão `2.0` pela `2.1`.

### 8.1) Criar versão 2.1 (simulação)

Para fins didáticos, vamos só dar uma nova tag (etiqueta de versão) para a mesma imagem:

```bash
docker tag <seu-docker-hub-account>/myapp-webapi:2.0 <seu-docker-hub-account>/myapp-webapi:2.1
docker push <seu-docker-hub-account>/myapp-webapi:2.1
```

### 8.2) Atualizar imagem no deployment

**Opção 1 - Imperativo (rápido):**

```bash
kubectl set image deployment/myapp-webapi webapi=<seu-docker-hub-account>/myapp-webapi:2.1 -n myapp
```

**Opção 2 - Declarativo (recomendado):**

Edite `deployment.yaml`, mude a imagem para `2.1` e a label `version: "2.1"`. Depois rode:

```bash
kubectl apply -f deployment.yaml
```

### 8.3) Acompanhar o rollout em tempo real

**Terminal 1** - Ver status do rollout:

```bash
kubectl rollout status deployment/myapp-webapi -n myapp
```

Você verá:

```
Waiting for deployment "myapp-webapi" rollout to finish: 1 out of 3 new replicas have been updated...
Waiting for deployment "myapp-webapi" rollout to finish: 2 out of 3 new replicas have been updated...
Waiting for deployment "myapp-webapi" rollout to finish: 1 old replicas are pending termination...
deployment "myapp-webapi" successfully rolled out
```

**Terminal 2** - Ver pods mudando:

```bash
kubectl get pods -n myapp -w
```

Você verá o **RollingUpdate** em ação. Os pods novos são criados por um **ReplicaSet** novo (o "ajudante" do Deployment que cuida de manter o número certo de cópias de uma versão):
1. Um novo pod é criado (v2.1)
2. Aguarda ficar `Ready`
3. Um pod antigo é terminado (v2.0)
4. Repete até todos serem atualizados

**Zero downtime!** ✅

### 8.4) Verificar histórico de revisões

```bash
kubectl rollout history deployment/myapp-webapi -n myapp
```

Esperado:

```
REVISION  CHANGE-CAUSE
1         <none>
2         <none>
```

Cada revisão é uma "foto" de uma versão do Deployment. Para registrar o motivo de cada mudança:

```bash
kubectl annotate deployment/myapp-webapi kubernetes.io/change-cause="Update to version 2.1" -n myapp
```

---

## 9) Rollback para versão anterior

**Por que isso importa:** se a versão nova der problema, o rollback devolve a versão anterior rapidamente, como um "desfazer".

Vamos fingir que a versão 2.1 deu problema e fazer o rollback.

### 9.1) Fazer rollback

```bash
kubectl rollout undo deployment/myapp-webapi -n myapp
```

### 9.2) Acompanhar rollback

```bash
kubectl rollout status deployment/myapp-webapi -n myapp
```

### 9.3) Verificar pods

```bash
kubectl get pods -n myapp
```

Os pods foram recriados com a imagem anterior (v2.0).

### 9.4) Rollback para revisão específica

Ver histórico:

```bash
kubectl rollout history deployment/myapp-webapi -n myapp
```

Rollback para revisão específica:

```bash
kubectl rollout undo deployment/myapp-webapi --to-revision=1 -n myapp
```

---

## 10) Estratégias de deployment

### 10.1) RollingUpdate (padrão)

**Características:**
- ✅ Zero downtime
- ✅ Rollout gradual
- ✅ Configurável (maxSurge = quantos pods extras podem ser criados; maxUnavailable = quantos podem ficar fora do ar)
- ⚠️ Por um tempo, a versão antiga e a nova rodam ao mesmo tempo

**Quando usar:** 
- Aplicações stateless (que não guardam dados dentro do próprio pod)
- APIs REST
- Microserviços

### 10.2) Recreate (alternativa)

Recreate desliga todos os pods antigos e só depois sobe os novos, como fechar a loja para trocar a vitrine.

**Características:**
- ⚠️ Downtime durante atualização
- ✅ Garante que apenas uma versão rode por vez
- ✅ Simples e rápido

**Quando usar:**
- Aplicações que não funcionam com duas versões rodando juntas
- Migrações de banco que quebram compatibilidade
- Desenvolvimento/testes

Para usar Recreate, edite `deployment.yaml` e **remova** o bloco `rollingUpdate`. Ele não funciona junto com `Recreate`:

```yaml
spec:
  strategy:
    type: Recreate
    # ⚠️ NÃO inclua o bloco rollingUpdate aqui!
    # Se mantiver rollingUpdate junto com type: Recreate, você verá o erro:
    # The Deployment "myapp-webapi" is invalid:
    # spec.strategy.rollingUpdate: Forbidden: may not be specified when strategy `type` is 'Recreate'
```

Depois aplique:

```bash
kubectl apply -f deployment.yaml
```

Acompanhe os pods sendo recriados (todos terminados antes de novos subirem):

```bash
kubectl get pods -n myapp -w
```

Verifique a nova revisão gerada:

```bash
kubectl rollout history deployment/myapp-webapi -n myapp
```

---

## 11) Health checks em ação

### 11.1) Verificar health checks

**Por que isso importa:** a readinessProbe diz se o pod está pronto para receber acessos; a livenessProbe diz se ele ainda está vivo (se não estiver, o Kubernetes reinicia o container).

Vamos criar um cenário em que um pod fica "não pronto".

**Opção 1 - Mudar readinessProbe para path inexistente:**

Edite `deployment.yaml`:

```yaml
readinessProbe:
  httpGet:
    path: /health  # path que não existe
    port: 8080
```

Aplique:

```bash
kubectl apply -f deployment.yaml
```

Observe os pods:

```bash
kubectl get pods -n myapp
```

Você verá pods com `READY: 0/1`, porque a readinessProbe está falhando.

O Service **não manda requisições** para pods que não estão prontos! ✅

### 11.2) Verificar eventos

```bash
kubectl describe pod <nome-do-pod> -n myapp
```

Na seção `Events` (histórico de acontecimentos do pod), você verá:

```
Warning  Unhealthy  Readiness probe failed: HTTP probe failed with statuscode: 404
```

### 11.3) Corrigir

Volte o path para `/products` e aplique novamente.

---

## 12) Boas práticas de Deployment

### ✅ Sempre use RollingUpdate para aplicações stateless

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

### ✅ Configure health checks

```yaml
readinessProbe:  # Quando o pod está pronto para tráfego
  httpGet:
    path: /health
    port: 8080

livenessProbe:   # Quando o pod está vivo
  httpGet:
    path: /health
    port: 8080
```

### ✅ Defina resource limits

```yaml
resources:
  requests:
    memory: "128Mi"
    cpu: "100m"
  limits:
    memory: "256Mi"
    cpu: "200m"
```

### ✅ Mantenha histórico de revisões

```yaml
spec:
  revisionHistoryLimit: 10  # Últimas 10 versões
```

### ✅ Use labels consistentes

```yaml
labels:
  app: myapp-webapi
  version: "2.0"
  environment: production
```

### ✅ Anote mudanças importantes

```bash
kubectl annotate deployment/myapp-webapi \
  kubernetes.io/change-cause="Deploy v2.0 with new feature" \
  -n myapp
```

---

## 13) Comandos úteis para Deployments

### Ver detalhes do deployment

```bash
kubectl describe deployment myapp-webapi -n myapp
```

### Ver logs de todos os pods

```bash
kubectl logs -l app=myapp-webapi -n myapp --tail=20
```

### Ver logs de um pod específico

```bash
kubectl logs <nome-do-pod> -n myapp -f
```

### Pausar rollout (congela a atualização no meio)

```bash
kubectl rollout pause deployment/myapp-webapi -n myapp
```

### Retomar rollout

```bash
kubectl rollout resume deployment/myapp-webapi -n myapp
```

### Reiniciar deployment (força recriação dos pods)

```bash
kubectl rollout restart deployment/myapp-webapi -n myapp
```

### Deletar deployment

```bash
kubectl delete deployment myapp-webapi -n myapp
```

---

## 14) Limpeza

Ao final deste módulo, você pode manter os recursos para o próximo módulo (Services (ClusterIP e NodePort)) ou limpar tudo:

```bash
# Deletar todos os recursos do namespace
kubectl delete all --all -n myapp

# Ou deletar o namespace inteiro
kubectl delete namespace myapp
```