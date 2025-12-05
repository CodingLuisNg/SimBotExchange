#!/bin/bash

# Stop Docker services for Fake Trading Market

echo "🛑 Stopping Fake Trading Market Docker services..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/docker"

# Stop and remove all containers, networks, and volumes
docker-compose down --remove-orphans

# Force stop any remaining containers using our network
docker ps -q --filter "network=docker_trading-network" | xargs -r docker stop 2>/dev/null
docker ps -aq --filter "network=docker_trading-network" | xargs -r docker rm 2>/dev/null

# Remove the network if it still exists
docker network rm docker_trading-network 2>/dev/null

echo "✅ All services stopped!"

