# Webinar Kubernetes + AKS (mão na massa)

## Por que este webinar existe
A ideia aqui é sair do “Kubernetes só na teoria” e ir para o **Kubernetes que você usa no dia a dia**, com prática guiada, comandos reais e manifests versionáveis, começando no **Minikube** (base sólida) e evoluindo para **AKS** (contexto de produção na Azure).

## O que vamos ver (sumário bem resumido)
**Kubernetes local (Minikube)**
- Setup do ambiente e primeiro deploy
- YAML do básico que importa (Namespaces, Labels e selectors)
- Pods na prática (logs/exec/describe/events + troubleshooting)
- Deployments (scale, rollout, rollback)
- Services (ClusterIP/NodePort) conectando web ↔ api
- Ingress no Minikube (host/path)
- ConfigMap e Secret (config “do jeito certo”)
- Health checks (readiness/liveness)
- Recursos e autoscaling (requests/limits + HPA)
- Persistência (PVC)
- Stateful básico (ex.: Postgres)
- Operação do dia a dia (k9s + padrões de diagnóstico)

**AKS (produção/cloud)**
- Criar AKS e migrar o mesmo app (Minikube → AKS)
- Exposição cloud (LoadBalancer + Ingress no AKS)
- Observabilidade objetiva (logs e métricas essenciais)
- CI/CD simples (Azure DevOps fazendo deploy no AKS)

E muito mais!
