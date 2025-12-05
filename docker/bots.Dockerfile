# Trading Bots - Python with gRPC
FROM python:3.11-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy proto files
COPY proto/ /app/proto/

# Copy requirements and install
COPY services/bots_python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Generate Python proto files
RUN mkdir -p generated && \
    python -m grpc_tools.protoc \
        -I./proto \
        --python_out=./generated \
        --grpc_python_out=./generated \
        ./proto/orderbook.proto ./proto/marketdata.proto

# Copy bot source code
COPY services/bots_python/bot.py .

# Set Python path to include generated directory
ENV PYTHONPATH=/app/generated:$PYTHONPATH

# Run the bot (can be overridden with bot ID)
CMD ["python", "bot.py"]

