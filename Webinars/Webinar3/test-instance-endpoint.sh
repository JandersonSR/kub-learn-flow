#!/bin/bash

# Script para testar o endpoint /instance e demonstrar load balancing
# Webinar 3 - Seção 6.2
# Executa DENTRO do cluster para demonstrar load balancing real

echo "=========================================="
echo "Testando Load Balancing - Endpoint /instance"
echo "=========================================="
echo ""
echo "Este script executará requisições de DENTRO do cluster"
echo "para demonstrar o load balancing entre os pods!"
echo ""

# Verificar se o namespace existe
if ! kubectl get namespace myapp &> /dev/null; then
    echo "❌ Erro: namespace 'myapp' não encontrado"
    echo "   Execute: kubectl apply -f namespace.yaml"
    exit 1
fi

# Verificar se o service existe
if ! kubectl get service myapp-webapi -n myapp &> /dev/null; then
    echo "❌ Erro: service 'myapp-webapi' não encontrado"
    echo "   Execute: kubectl apply -f service.yaml"
    exit 1
fi

echo "✅ Namespace e Service encontrados"
echo ""
echo "Criando pod temporário para fazer requisições..."
echo ""

# Criar um pod temporário com curl para fazer as requisições
kubectl run test-lb --rm -i --restart=Never --image=curlimages/curl:latest -n myapp -- sh -c '
echo "Fazendo 20 requisições ao Service myapp-webapi:8080"
echo "=========================================="
echo ""

for i in $(seq 1 20); do
    echo "📡 Requisição $i:"
    
    # Fazer requisição e extrair campos importantes
    RESPONSE=$(curl -s http://myapp-webapi:8080/instance)
    
    # Extrair campos manualmente (sem jq)
    INSTANCE_ID=$(echo "$RESPONSE" | grep -o "\"instanceId\":\"[^\"]*\"" | cut -d\" -f4)
    HOSTNAME=$(echo "$RESPONSE" | grep -o "\"hostname\":\"[^\"]*\"" | cut -d\" -f4)
    UPTIME=$(echo "$RESPONSE" | grep -o "\"uptime\":\"[^\"]*\"" | cut -d\" -f4)
    
    echo "   Instance ID: $INSTANCE_ID"
    echo "   Hostname: $HOSTNAME"
    echo "   Uptime: $UPTIME"
    echo "---"
    
    sleep 0.3
done

echo ""
echo "=========================================="
echo "✅ Teste concluído!"
echo "=========================================="
echo ""
echo "Observe que diferentes pods responderam!"
echo "Isso demonstra o load balancing do Service."
'

echo ""
echo "=========================================="
echo "💡 Dica:"
echo "=========================================="
echo "Para ver a distribuição, observe os diferentes"
echo "Instance IDs e Hostnames nas requisições acima."
echo ""
echo "Cada Instance ID único = 1 pod diferente!"

