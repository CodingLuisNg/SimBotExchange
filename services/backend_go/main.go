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
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	marketdata "github.com/CodingLuisNg/FakeTradingMarket/services/backend_go/proto/marketdata"
	orderbook "github.com/CodingLuisNg/FakeTradingMarket/services/backend_go/proto/orderbook"
)

// Buffer and timeout constants for non-blocking broadcast.
const (
	subscriberBuffer = 10
	clientSendBuffer = 16
	writeTimeout     = 5 * time.Second
	pingPeriod       = 30 * time.Second
)

// Atomic counters for dropped broadcast messages (observable without locking).
var (
	broadcastDroppedSubscribers uint64
	broadcastDroppedClients     uint64
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
	// clients maps each active WebSocket connection to its wsClient wrapper.
	// All sends go through the wsClient.sendCh — never directly on the conn.
	clients map[*websocket.Conn]*wsClient
	// subscribers holds per-bot buffered channels for gRPC market data streams.
	subscribers  map[chan *marketdata.MarketUpdate]struct{}
	lastUpdate   *marketdata.MarketUpdate
	orderUpdates []*orderbook.OrderUpdate
	// Track frontend orders (order_id -> true means it's a frontend order)
	frontendOrders map[string]bool
}

// wsClient wraps a single WebSocket connection with a dedicated writer goroutine.
// All writes to the connection MUST go through sendCh to avoid concurrent writes
// and to prevent a slow client from holding any server-wide lock.
type wsClient struct {
	conn     *websocket.Conn
	sendCh   chan interface{}
	done     chan struct{}
	stopOnce sync.Once
	wg       sync.WaitGroup
}

// startWriter spawns a goroutine that drains sendCh and writes to the WebSocket.
// It sends periodic pings and exits cleanly when done is closed or a write fails.
func (wc *wsClient) startWriter() {
	ticker := time.NewTicker(pingPeriod)
	wc.wg.Add(1)
	go func() {
		defer wc.wg.Done()
		defer ticker.Stop()
		for {
			select {
			case msg, ok := <-wc.sendCh:
				if !ok {
					return
				}
				wc.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
				if err := wc.conn.WriteJSON(msg); err != nil {
					return
				}
			case <-ticker.C:
				wc.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
				if err := wc.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			case <-wc.done:
				return
			}
		}
	}()
}

// stop signals the writer goroutine to exit, waits for it to finish, then closes
// the underlying connection. Safe to call multiple times.
func (wc *wsClient) stop() {
	wc.stopOnce.Do(func() {
		close(wc.done)
	})
	wc.wg.Wait()
	wc.conn.Close()
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
		clients:        make(map[*websocket.Conn]*wsClient),
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

	// INVARIANT: ch must be deleted AND closed while holding s.mu.
	// Broadcast snapshots s.subscribers under s.mu, so once this defer removes
	// and closes ch under the lock, no future Broadcast snapshot will include it,
	// preventing send-on-closed-channel panics.
	defer func() {
		s.mu.Lock()
		delete(s.subscribers, ch)
		close(ch)
		s.mu.Unlock()
	}()

	for update := range ch {
		if err := stream.Send(update); err != nil {
			return err
		}
	}
	return nil
}

// Broadcast fans out an update to all gRPC subscribers and WebSocket clients.
//
// Safety: state mutations and recipient snapshots happen under s.mu.
// All network I/O (channel sends, WriteJSON) happens AFTER releasing the lock
// so that no slow client can stall the broadcast path or any other lock holder.
func (s *server) Broadcast(update interface{}) {
	// --- Critical section: mutate state and snapshot recipients ---
	s.mu.Lock()

	var (
		marketMsg *marketdata.MarketUpdate
		wsMsg     interface{}
		subs      []chan *marketdata.MarketUpdate
		wsClients []*wsClient
	)

	if mu, ok := update.(*marketdata.MarketUpdate); ok {
		s.lastUpdate = mu
		marketMsg = mu
		wsMsg = mu
		// Snapshot both subscriber channels and WS client send queues.
		subs = make([]chan *marketdata.MarketUpdate, 0, len(s.subscribers))
		for ch := range s.subscribers {
			subs = append(subs, ch)
		}
		wsClients = make([]*wsClient, 0, len(s.clients))
		for _, wc := range s.clients {
			wsClients = append(wsClients, wc)
		}
	} else if ou, ok := update.(*orderbook.OrderUpdate); ok {
		s.orderUpdates = append(s.orderUpdates, ou)
		if len(s.orderUpdates) > 100 { // Keep last 100
			s.orderUpdates = s.orderUpdates[1:]
		}
		// Only notify WebSocket clients if this is a tracked frontend order.
		if s.frontendOrders[ou.OrderId] {
			log.Printf("📢 Sending fill notification to frontend: OrderID=%s Status=%s", ou.OrderId, ou.Status)
			wsMsg = OrderUpdateJSON{
				OrderID:   ou.OrderId,
				Symbol:    ou.Symbol,
				Price:     ou.Price,
				Quantity:  ou.Quantity,
				Status:    ou.Status,
				Timestamp: ou.Timestamp,
			}
			wsClients = make([]*wsClient, 0, len(s.clients))
			for _, wc := range s.clients {
				wsClients = append(wsClients, wc)
			}
			if ou.Status == "FILLED" {
				delete(s.frontendOrders, ou.OrderId)
			}
		}
	}

	s.mu.Unlock()
	// --- End critical section: all I/O below is lock-free ---

	// Non-blocking send to gRPC bot subscribers.
	// Drops are counted atomically and logged; bots will receive the next update.
	for _, ch := range subs {
		select {
		case ch <- marketMsg:
		default:
			atomic.AddUint64(&broadcastDroppedSubscribers, 1)
			log.Printf("Subscriber channel full, dropping market update (total dropped: %d)",
				atomic.LoadUint64(&broadcastDroppedSubscribers))
		}
	}

	// Non-blocking send to WebSocket clients via their per-connection send queues.
	// A full queue means the client is too slow; we drop and count rather than block.
	if wsMsg != nil {
		for _, wc := range wsClients {
			select {
			case wc.sendCh <- wsMsg:
			default:
				atomic.AddUint64(&broadcastDroppedClients, 1)
				log.Printf("WebSocket send queue full, dropping update (total dropped: %d)",
					atomic.LoadUint64(&broadcastDroppedClients))
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

	// Create per-connection writer. All writes go through sendCh so this
	// goroutine is the sole writer on the connection (gorilla/websocket requires
	// single concurrent writer).
	wc := &wsClient{
		conn:   c,
		sendCh: make(chan interface{}, clientSendBuffer),
		done:   make(chan struct{}),
	}
	wc.startWriter()

	// Register client and capture current market snapshot under lock.
	// Do NOT write to the socket here — that would be I/O under the lock.
	s.mu.Lock()
	s.clients[c] = wc
	var initial *marketdata.MarketUpdate
	if s.lastUpdate != nil {
		initial = s.lastUpdate
	}
	s.mu.Unlock()

	// Send initial state non-blocking through the writer goroutine (no lock held).
	if initial != nil {
		select {
		case wc.sendCh <- initial:
		default:
		}
	}

	// Configure read-side: small read limit (we only read control frames),
	// read deadline extended on each pong so we detect dead connections.
	c.SetReadLimit(512)
	c.SetReadDeadline(time.Now().Add(pingPeriod * 2))
	c.SetPongHandler(func(string) error {
		c.SetReadDeadline(time.Now().Add(pingPeriod * 2))
		return nil
	})

	// Read loop: purpose is solely to detect client disconnection.
	// On any read error the client is removed from the registry and the
	// writer goroutine is stopped cleanly.
	for {
		if _, _, err := c.ReadMessage(); err != nil {
			s.mu.Lock()
			delete(s.clients, c)
			s.mu.Unlock()
			wc.stop() // signal writer, wait for it, then close conn
			return
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
