#!/bin/bash

# Fake Trading Market - Docker Startup Script
# This script builds and starts all services using Docker Compose

set -e  # Exit on error

echo "🚀 Starting Fake Trading Market System..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: docker-compose is not installed. Please install it and try again."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Navigate to docker directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/docker"

echo "🔨 Building and starting services..."
echo ""

# Build and start all services
docker-compose up --build -d

echo ""
echo "⏳ Waiting for services to be healthy..."
echo ""

# Wait for services to be healthy
sleep 5

# Check service status
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "✨ Fake Trading Market is now running!"
echo ""
echo "📍 Access Points:"
echo "   Frontend:        http://localhost:3000"
echo "   Backend HTTP:    http://localhost:8080"
echo "   Backend gRPC:    localhost:50051"
echo "   Matching Engine: localhost:50052"
echo ""
echo "📋 Useful Commands:"
echo "   View logs:       docker-compose logs -f"
echo "   Stop services:   docker-compose down"
echo "   Restart:         docker-compose restart"
echo ""
echo "🐛 Troubleshooting:"
echo "   See DOCKER_SETUP.md for detailed documentation"
echo ""


