package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	marketdata "github.com/CodingLuisNg/FakeTradingMarket/services/backend_go/proto/marketdata"
	orderbook "github.com/CodingLuisNg/FakeTradingMarket/services/backend_go/proto/orderbook"
)

var (
	port               = flag.Int("port", 8080, "The server port")
	grpcPort           = flag.Int("grpc_port", 50051, "The gRPC server port")
	matchingEngineAddr = flag.String("matching_engine", "localhost:50052", "The matching engine address")
	upgrader           = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

type server struct {
	marketdata.UnimplementedMarketDataServiceServer
	mu sync.RWMutex
	// We use a map of channels to broadcast updates to WebSocket clients
	clients map[*websocket.Conn]bool
	// We also support gRPC subscribers (bots)
	subscribers  map[chan *marketdata.MarketUpdate]struct{}
	lastUpdate   *marketdata.MarketUpdate
	orderUpdates []*orderbook.OrderUpdate
	// Track frontend orders (order_id -> true means it's a frontend order)
	frontendOrders map[string]bool
}

// OrderUpdateJSON is used for WebSocket JSON serialization with snake_case fields
type OrderUpdateJSON struct {
	OrderID   string  `json:"order_id"`
	Symbol    string  `json:"symbol"`
	Price     float64 `json:"price"`
	Quantity  float64 `json:"quantity"`
	Status    string  `json:"status"`
	Timestamp int64   `json:"timestamp"`
}

func newServer() *server {
	return &server{
		clients:        make(map[*websocket.Conn]bool),
		subscribers:    make(map[chan *marketdata.MarketUpdate]struct{}),
		frontendOrders: make(map[string]bool),
	}
}

func (s *server) Subscribe(req *marketdata.SubscribeRequest, stream marketdata.MarketDataService_SubscribeServer) error {
	ch := make(chan *marketdata.MarketUpdate, 10)
	s.mu.Lock()
	s.subscribers[ch] = struct{}{}
	// Send last update immediately if available
	if s.lastUpdate != nil {
		// Non-blocking send
		select {
		case ch <- s.lastUpdate:
		default:
		}
	}
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.subscribers, ch)
		s.mu.Unlock()
		close(ch)
	}()

	for update := range ch {
		if err := stream.Send(update); err != nil {
			return err
		}
	}
	return nil
}

func (s *server) Broadcast(update interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Update state
	if mu, ok := update.(*marketdata.MarketUpdate); ok {
		s.lastUpdate = mu

		// Broadcast to gRPC subscribers
		for ch := range s.subscribers {
			select {
			case ch <- mu:
			default:
				// Skip if channel is full
			}
		}

		// Broadcast market updates to all WebSocket clients
		for client := range s.clients {
			err := client.WriteJSON(update)
			if err != nil {
				log.Printf("Websocket error: %v", err)
				client.Close()
				delete(s.clients, client)
			}
		}
	} else if ou, ok := update.(*orderbook.OrderUpdate); ok {
		s.orderUpdates = append(s.orderUpdates, ou)
		if len(s.orderUpdates) > 100 { // Keep last 100
			s.orderUpdates = s.orderUpdates[1:]
		}

		// Only send order updates to WebSocket if it's a frontend order
		if s.frontendOrders[ou.OrderId] {
			log.Printf("📢 Sending fill notification to frontend: OrderID=%s Status=%s", ou.OrderId, ou.Status)

			// Convert to JSON struct with snake_case fields for frontend
			orderJSON := OrderUpdateJSON{
				OrderID:   ou.OrderId,
				Symbol:    ou.Symbol,
				Price:     ou.Price,
				Quantity:  ou.Quantity,
				Status:    ou.Status,
				Timestamp: ou.Timestamp,
			}

			for client := range s.clients {
				err := client.WriteJSON(orderJSON)
				if err != nil {
					log.Printf("Websocket error: %v", err)
					client.Close()
					delete(s.clients, client)
				}
			}
			// Clean up filled orders from tracking
			if ou.Status == "FILLED" {
				delete(s.frontendOrders, ou.OrderId)
			}
		}
	}
}

func (s *server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}
	defer c.Close()

	s.mu.Lock()
	s.clients[c] = true
	// Send initial state
	if s.lastUpdate != nil {
		c.WriteJSON(s.lastUpdate)
	}
	s.mu.Unlock()

	for {
		_, _, err := c.ReadMessage()
		if err != nil {
			s.mu.Lock()
			delete(s.clients, c)
			s.mu.Unlock()
			break
		}
	}
}

func main() {
	flag.Parse()

	// 1. Connect to Matching Engine
	conn, err := grpc.Dial(*matchingEngineAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()
	matcherClient := orderbook.NewMatchingEngineClient(conn)
	marketDataClient := marketdata.NewMarketDataServiceClient(conn)

	srv := newServer()

	// Start background routine to consume market data from Matching Engine
	go func() {
		for {
			stream, err := marketDataClient.Subscribe(context.Background(), &marketdata.SubscribeRequest{Symbol: "TE"})
			if err != nil {
				log.Printf("Failed to subscribe to matching engine: %v. Retrying...", err)
				time.Sleep(2 * time.Second)
				continue
			}
			log.Println("Connected to Matching Engine Market Data")
			for {
				update, err := stream.Recv()
				if err != nil {
					log.Printf("Market data stream ended: %v", err)
					break
				}
				srv.Broadcast(update)
			}
			time.Sleep(1 * time.Second)
		}
	}()

	// Subscribe to Order Updates
	go func() {
		for {
			stream, err := matcherClient.SubscribeOrders(context.Background(), &orderbook.SubscribeOrdersRequest{})
			if err != nil {
				log.Printf("Failed to subscribe to orders: %v. Retrying...", err)
				time.Sleep(2 * time.Second)
				continue
			}
			log.Println("Connected to Matching Engine Orders stream")
			for {
				update, err := stream.Recv()
				if err != nil {
					log.Printf("Order stream ended: %v", err)
					break
				}
				log.Printf("📨 Received order update: OrderID=%s Status=%s", update.OrderId, update.Status)
				srv.Broadcast(update)
			}
			time.Sleep(1 * time.Second)
		}
	}()

	// 2. Start gRPC Server for Bots
	lis, err := net.Listen("tcp", fmt.Sprintf(":%d", *grpcPort))
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	grpcServer := grpc.NewServer()
	marketdata.RegisterMarketDataServiceServer(grpcServer, srv)

	//AddOrder proxy
	proxy := &orderProxy{client: matcherClient}
	orderbook.RegisterMatchingEngineServer(grpcServer, proxy)

	go func() {
		log.Printf("gRPC server listening at %v", lis.Addr())
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("failed to serve: %v", err)
		}
	}()

	// 3. Start HTTP Server for Frontend
	http.HandleFunc("/order", func(w http.ResponseWriter, r *http.Request) {
		// CORS Headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		type OrderJSON struct {
			Symbol   string  `json:"symbol"`
			Side     string  `json:"side"` // "buy" or "sell"
			Price    float64 `json:"price"`
			Quantity float64 `json:"quantity"`
		}
		var oj OrderJSON
		if err := json.NewDecoder(r.Body).Decode(&oj); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		side := orderbook.Side_SIDE_UNSPECIFIED
		if oj.Side == "buy" {
			side = orderbook.Side_SIDE_BUY
		} else if oj.Side == "sell" {
			side = orderbook.Side_SIDE_SELL
		}

		// Generate unique order ID for frontend orders
		orderID := "FE-" + uuid.New().String()[:8]

		// Track this as a frontend order
		srv.mu.Lock()
		srv.frontendOrders[orderID] = true
		srv.mu.Unlock()

		log.Printf("Frontend order placed: ID=%s Side=%s Price=%.2f Qty=%.0f", orderID, oj.Side, oj.Price, oj.Quantity)

		// Call Matching Engine
		resp, err := matcherClient.AddOrder(context.Background(), &orderbook.AddOrderRequest{
			Order: &orderbook.Order{
				OrderId:  orderID,
				Symbol:   oj.Symbol,
				Side:     side,
				Price:    oj.Price,
				Quantity: oj.Quantity,
			},
		})
		if err != nil {
			// Remove from tracking on failure
			srv.mu.Lock()
			delete(srv.frontendOrders, orderID)
			srv.mu.Unlock()
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Create explicit JSON response with correct field names
		type OrderResponseJSON struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
			OrderID string `json:"order_id"`
		}

		jsonResp := OrderResponseJSON{
			Success: resp.Success,
			Message: resp.Message,
			OrderID: orderID, // Use the order ID we generated, not from response
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(jsonResp)
	})

	http.HandleFunc("/marketdata", func(w http.ResponseWriter, r *http.Request) {
		// Simple polling endpoint returning last update
		srv.mu.RLock()
		defer srv.mu.RUnlock()
		if srv.lastUpdate == nil {
			http.Error(w, "No data", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*") // CORS for frontend
		json.NewEncoder(w).Encode(srv.lastUpdate)
	})

	http.HandleFunc("/ws", srv.handleWebSocket)

	log.Printf("HTTP server listening at :%d", *port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", *port), nil); err != nil {
		log.Fatalf("failed to serve http: %v", err)
	}
}

type orderProxy struct {
	orderbook.UnimplementedMatchingEngineServer
	client orderbook.MatchingEngineClient
}

func (p *orderProxy) AddOrder(ctx context.Context, req *orderbook.AddOrderRequest) (*orderbook.AddOrderResponse, error) {
	return p.client.AddOrder(ctx, req)
}
