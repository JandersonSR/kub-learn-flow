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

