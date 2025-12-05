# Matching Engine - C++ with gRPC
FROM ubuntu:22.04

# Install dependencies including protobuf and gRPC from Ubuntu packages
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    pkg-config \
    autoconf \
    automake \
    libtool \
    curl \
    make \
    g++ \
    unzip \
    libprotobuf-dev \
    protobuf-compiler \
    libgrpc++-dev \
    libgrpc-dev \
    && rm -rf /var/lib/apt/lists/*

# Install grpc plugin for protoc
RUN apt-get update && apt-get install -y \
    protobuf-compiler-grpc \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy proto files first
COPY proto/ /app/proto/

# Copy CMakeLists.txt and source
COPY services/matching_engine_cpp/CMakeLists.txt /app/
COPY services/matching_engine_cpp/src/ /app/src/

# Build the application
RUN mkdir -p build && cd build && \
    cmake .. && \
    make -j$(nproc)

# Expose port
EXPOSE 50052

# Run the matching engine
CMD ["./build/MatchingEngine"]

