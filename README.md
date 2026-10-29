# Curso Kubernetes + AKS (mão na massa)

## Por que este curso existe
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

## Depois deste curso

Este curso é o degrau 1. Os próximos:

- **Na prática, na Azure:** [aks-step-by-step](https://github.com/JandersonSR/aks-step-by-step) leva uma API ASP.NET real para o AKS, um nível por vez (Helm, CI/CD, Ingress, Key Vault, Terraform, Argo CD, Kafka, Harbor).
- **O porquê de cada peça:** o curso [Plataforma .NET em Produção](https://learnflowprojec.vercel.app/projetos/plataforma-dotnet/docs/README.html), no learnFlow, explica a stack inteira com conceitos, vídeos, previsões e labs de quebra. O [Módulo 6 (Contêiner e Kubernetes do zero)](https://learnflowprojec.vercel.app/projetos/plataforma-dotnet/docs/modulo-06/README.html) explica o porquê de cada conceito daqui e aponta para estes módulos, e o [Módulo 7 (Helm)](https://learnflowprojec.vercel.app/projetos/plataforma-dotnet/docs/modulo-07/README.html) continua de onde este curso para.

## Módulos

Cada pasta em `Modulos/` é um passo a passo (`Content.md`) com os apps e os manifests daquele assunto:

| Módulo | O que você aprende |
|---|---|
| [01 · Setup e primeiro deploy](Modulos/01-Setup-e-Primeiro-Deploy/Content.md) | Docker, imagem, Minikube e o primeiro app no Kubernetes |
| [02 · YAML, Namespaces e Labels](Modulos/02-YAML-Namespaces-e-Labels/Content.md) | Descrever o app em arquivos YAML e organizar recursos |
| [03 · Deployments](Modulos/03-Deployments-Scale-Rollout-Rollback/Content.md) | Réplicas, atualizar versão (rollout) e voltar atrás (rollback) |
| [04 · Services](Modulos/04-Services-ClusterIP-NodePort/Content.md) | Conectar site ↔ API (ClusterIP) e acessar de fora (NodePort) |
| [05 · Ingress](Modulos/05-Ingress/Content.md) | Um endereço amigável (host/path) para os apps |
| [06 · ConfigMaps e Secrets](Modulos/06-ConfigMaps-e-Secrets/Content.md) | Configuração sem mexer no código |
| [07 · Projeto prático](Modulos/07-Projeto-Pratico/Content.md) | Tudo junto, do zero ao app funcionando |

## Site hands-on

O mesmo conteúdo vira um site com menu dos módulos, passo a passo com check de "concluí", botão de copiar nos comandos e progresso salvo no navegador.

```
Modulos/*/Content.md   ← o conteúdo (cada "## " vira um passo)
scripts/build.mjs      ← gera o site em dist/
scripts/site.css|js    ← visual e interações
vercel.json            ← build e cabeçalhos da hospedagem
```

Para mudar o site, edite o `Content.md` do módulo e dê `git push`. Um módulo novo é só uma pasta nova em `Modulos/` (ex.: `08-Health-Checks/Content.md`).

### Rodar no computador

Precisa de Node 18 ou mais novo.

```bash
npm run build          # gera dist/
npm run dev            # gera e abre em http://localhost:3000
```

3. Deixe tudo como está (o `vercel.json` já define `npm run build` e a pasta `dist`) e clique em **Deploy**.
4. O site fica em `https://kub-learn-flow-<algo>.vercel.app`. Em **Settings → Domains** dá para trocar o nome.

Cada `git push` na `main` publica uma versão nova.
