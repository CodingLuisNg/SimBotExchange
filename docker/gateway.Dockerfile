# Backend Gateway - Go with gRPC
FROM golang:1.24-alpine AS builder

# Install protoc and required tools
RUN apk add --no-cache git protobuf-dev protobuf

# Install protoc-gen-go and protoc-gen-go-grpc
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

WORKDIR /app

# Copy proto files
COPY proto/ /app/proto/

# Copy go module files
COPY services/backend_go/go.mod services/backend_go/go.sum ./

# Download dependencies
RUN go mod download

# Generate proto files
RUN mkdir -p proto/marketdata proto/orderbook && \
    protoc --go_out=./proto/marketdata --go_opt=paths=source_relative \
           --go-grpc_out=./proto/marketdata --go-grpc_opt=paths=source_relative \
           -I./proto ./proto/marketdata.proto && \
    protoc --go_out=./proto/orderbook --go_opt=paths=source_relative \
           --go-grpc_out=./proto/orderbook --go-grpc_opt=paths=source_relative \
           -I./proto ./proto/orderbook.proto

# Copy source code
COPY services/backend_go/main.go .

# Ensure dependencies are tidy
RUN go mod tidy

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o backend_go main.go

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy the binary
COPY --from=builder /app/backend_go .

# Expose ports (gRPC: 50051, HTTP: 8080)
EXPOSE 50051 8080

# Run the backend
CMD ["./backend_go", "-matching_engine=matching-engine:50052"]

