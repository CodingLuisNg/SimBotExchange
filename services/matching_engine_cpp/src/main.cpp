#include <iostream>
#include <iomanip>
#include <memory>
#include <string>
#include <thread>
#include <vector>
#include <mutex>
#include <algorithm>
#include <queue>
#include <condition_variable>
#include <optional>
#include <ctime>
#include <cmath>
#include <cstdint>

#include <grpcpp/grpcpp.h>

#include "orderbook.grpc.pb.h"
#include "marketdata.grpc.pb.h"

using grpc::Server;
using grpc::ServerBuilder;
using grpc::ServerContext;
using grpc::Status;
using grpc::ServerWriter;

using orderbook::MatchingEngine;
using orderbook::AddOrderRequest;
using orderbook::AddOrderResponse;
using orderbook::Order;
using orderbook::Side;

using marketdata::MarketDataService;
using marketdata::SubscribeRequest;
using marketdata::MarketUpdate;

// Fixed-point decimal price representation (4 decimal places)
// 1.0000 dollar = 10000 ticks
class Price {
public:
    static constexpr int64_t SCALE = 10000;  // 4 decimal places

    Price() : ticks_(0) {}
    explicit Price(int64_t ticks) : ticks_(ticks) {}
    explicit Price(double value) : ticks_(static_cast<int64_t>(std::round(value * SCALE))) {}

    static Price fromDouble(double value) {
        return Price(value);
    }

    double toDouble() const {
        return static_cast<double>(ticks_) / SCALE;
    }

    int64_t ticks() const { return ticks_; }

    // Comparison operators
    bool operator<(const Price& other) const { return ticks_ < other.ticks_; }
    bool operator<=(const Price& other) const { return ticks_ <= other.ticks_; }
    bool operator>(const Price& other) const { return ticks_ > other.ticks_; }
    bool operator>=(const Price& other) const { return ticks_ >= other.ticks_; }
    bool operator==(const Price& other) const { return ticks_ == other.ticks_; }
    bool operator!=(const Price& other) const { return ticks_ != other.ticks_; }

    // Arithmetic operators
    Price operator+(const Price& other) const { return Price(ticks_ + other.ticks_); }
    Price operator-(const Price& other) const { return Price(ticks_ - other.ticks_); }

private:
    int64_t ticks_;
};

// Simple Order Book implementation
struct OrderEntry {
    std::string order_id;
    Price price;
    double quantity;
    Side side;
};

class OrderBook {
public:
    static const Price MIN_PRICE;  // Price floor - stock can't go below $1

    void AddOrder(const Order& order) {
        std::lock_guard<std::mutex> lock(mu_);

        Price price = Price::fromDouble(order.price());

        // Reject orders with invalid price
        if (price < MIN_PRICE) {
            std::cout << "❌ Rejected order: price $" << std::fixed << std::setprecision(2)
                      << price.toDouble() << " below minimum $" << MIN_PRICE.toDouble() << std::endl;
            return;
        }

        std::string side_str = (order.side() == Side::SIDE_BUY) ? "BUY" : "SELL";
        std::cout << "📥 " << side_str << " " << static_cast<int>(order.quantity())
                  << " @ $" << std::fixed << std::setprecision(2) << price.toDouble()
                  << " [" << order.order_id() << "]" << std::endl;

        if (order.side() == Side::SIDE_BUY) {
            bids_.push_back({order.order_id(), price, order.quantity(), order.side()});
            std::sort(bids_.begin(), bids_.end(), [](const OrderEntry& a, const OrderEntry& b) {
                return a.price > b.price; // Descending for bids
            });
        } else {
            asks_.push_back({order.order_id(), price, order.quantity(), order.side()});
            std::sort(asks_.begin(), asks_.end(), [](const OrderEntry& a, const OrderEntry& b) {
                return a.price < b.price; // Ascending for asks
            });
        }

        Match();
    }

    MarketUpdate GetTopLevel() {
        std::lock_guard<std::mutex> lock(mu_);
        MarketUpdate update;
        update.set_symbol("TE");
        update.set_last_price(last_traded_price_.toDouble());
        update.set_volume(total_volume_);
        
        if (!bids_.empty()) {
            update.set_best_bid_price(bids_.front().price.toDouble());
            update.set_best_bid_qty(bids_.front().quantity);
            
            // Add top 5 bids
            int count = 0;
            for (const auto& bid : bids_) {
                if (count++ >= 5) break;
                auto* entry = update.add_bids();
                entry->set_price(bid.price.toDouble());
                entry->set_quantity(bid.quantity);
            }
        }
        if (!asks_.empty()) {
            update.set_best_ask_price(asks_.front().price.toDouble());
            update.set_best_ask_qty(asks_.front().quantity);

            // Add top 5 asks
            int count = 0;
            for (const auto& ask : asks_) {
                if (count++ >= 5) break;
                auto* entry = update.add_asks();
                entry->set_price(ask.price.toDouble());
                entry->set_quantity(ask.quantity);
            }
        }
        return update;
    }

    marketdata::OrderBookSnapshot GetSnapshot() {
        std::lock_guard<std::mutex> lock(mu_);
        marketdata::OrderBookSnapshot snapshot;
        snapshot.set_symbol("TE");
        snapshot.set_timestamp(std::time(nullptr));

        for (const auto& bid : bids_) {
            auto* entry = snapshot.add_bids();
            entry->set_price(bid.price.toDouble());
            entry->set_quantity(bid.quantity);
        }
        for (const auto& ask : asks_) {
            auto* entry = snapshot.add_asks();
            entry->set_price(ask.price.toDouble());
            entry->set_quantity(ask.quantity);
        }
        return snapshot;
    }

    // Simple thread-safe queue for updates
    struct UpdateQueue {
        std::queue<orderbook::OrderUpdate> q;
        std::mutex m;
        std::condition_variable cv;

        void Push(const orderbook::OrderUpdate& u) {
            std::lock_guard<std::mutex> l(m);
            q.push(u);
            cv.notify_one();
        }

        std::optional<orderbook::OrderUpdate> Pop() {
            std::unique_lock<std::mutex> l(m);
            cv.wait(l, [this]{ return !q.empty(); });
            auto val = q.front();
            q.pop();
            return val;
        }
    };

    std::shared_ptr<UpdateQueue> SubscribeToOrders() {
        std::lock_guard<std::mutex> lock(subs_mu_);
        auto q = std::make_shared<UpdateQueue>();
        subscribers_.push_back(q);
        return q;
    }

    void UnsubscribeOrders(std::shared_ptr<UpdateQueue> q) {
        std::lock_guard<std::mutex> lock(subs_mu_);
        subscribers_.erase(std::remove(subscribers_.begin(), subscribers_.end(), q), subscribers_.end());
    }

private:
    void BroadcastUpdate(const orderbook::OrderUpdate& update) {
        std::lock_guard<std::mutex> lock(subs_mu_);
        for (auto& sub : subscribers_) {
            sub->Push(update);
        }
    }

    void Match() {
        bool trades_executed = false;

        while (!bids_.empty() && !asks_.empty()) {
            auto& best_bid = bids_.front();
            auto& best_ask = asks_.front();

            if (best_bid.price >= best_ask.price) {
                double trade_qty = std::min(best_bid.quantity, best_ask.quantity);
                Price trade_price = best_ask.price; // Price of the resting order (ask)

                last_traded_price_ = trade_price;
                total_volume_ += trade_qty;

                // Create updates
                orderbook::OrderUpdate bid_update;
                bid_update.set_order_id(best_bid.order_id);
                bid_update.set_symbol("TE");
                bid_update.set_price(trade_price.toDouble());
                bid_update.set_quantity(trade_qty);
                bid_update.set_status("FILLED"); // Or PARTIALLY_FILLED if we tracked original qty
                bid_update.set_timestamp(std::time(nullptr));
                
                orderbook::OrderUpdate ask_update;
                ask_update.set_order_id(best_ask.order_id);
                ask_update.set_symbol("TE");
                ask_update.set_price(trade_price.toDouble());
                ask_update.set_quantity(trade_qty);
                ask_update.set_status("FILLED");
                ask_update.set_timestamp(std::time(nullptr));

                // Broadcast BEFORE modifying state (or after? doesn't matter much for now)
                BroadcastUpdate(bid_update);
                BroadcastUpdate(ask_update);

                best_bid.quantity -= trade_qty;
                best_ask.quantity -= trade_qty;

                if (best_bid.quantity <= 0) bids_.erase(bids_.begin());
                if (best_ask.quantity <= 0) asks_.erase(asks_.begin());
                
                std::cout << "✅ Trade executed: " << static_cast<int>(trade_qty) << " shares @ $"
                          << std::fixed << std::setprecision(2) << trade_price.toDouble() << std::endl;
                trades_executed = true;
            } else {
                break;
            }
        }
    }

    std::vector<OrderEntry> bids_;
    std::vector<OrderEntry> asks_;
    Price last_traded_price_ = Price::fromDouble(100.0);
    double total_volume_ = 0.0;
    std::mutex mu_;
    
    std::vector<std::shared_ptr<UpdateQueue>> subscribers_;
    std::mutex subs_mu_;
};

// Define MIN_PRICE constant
const Price OrderBook::MIN_PRICE = Price::fromDouble(1.0);

// Global OrderBook instance
OrderBook g_order_book;

// Service Implementation
class MarketDataServiceImpl final : public MarketDataService::Service {
    Status Subscribe(ServerContext* context, const SubscribeRequest* request, ServerWriter<MarketUpdate>* writer) override {
        // Simple streaming: send update every 100ms
        while (!context->IsCancelled()) {
            MarketUpdate update = g_order_book.GetTopLevel();
            writer->Write(update);
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        return Status::OK;
    }

    Status GetOrderBook(ServerContext* context, const marketdata::GetOrderBookRequest* request, marketdata::OrderBookSnapshot* reply) override {
        *reply = g_order_book.GetSnapshot();
        return Status::OK;
    }
};

class MatchingEngineImpl final : public MatchingEngine::Service {
    Status AddOrder(ServerContext* context, const AddOrderRequest* request, AddOrderResponse* reply) override {
        g_order_book.AddOrder(request->order());
        reply->set_success(true);
        reply->set_message("Order accepted");
        reply->set_order_id(request->order().order_id());
        return Status::OK;
    }

    Status SubscribeOrders(ServerContext* context, const orderbook::SubscribeOrdersRequest* request, ServerWriter<orderbook::OrderUpdate>* writer) override {
        auto queue = g_order_book.SubscribeToOrders();
        while (!context->IsCancelled()) {
            auto update = queue->Pop();
            if (update) {
                writer->Write(*update);
            } else {
                // Queue closed or empty (should block in Pop usually, but here we might need a better queue)
                // For simplicity, let's assume Pop blocks or we sleep.
                // Our simple queue below will block.
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
            }
        }
        g_order_book.UnsubscribeOrders(queue);
        return Status::OK;
    }
};

void RunServer() {
    std::string server_address("0.0.0.0:50052");
    MatchingEngineImpl service;
    MarketDataServiceImpl market_data_service;

    ServerBuilder builder;
    builder.AddListeningPort(server_address, grpc::InsecureServerCredentials());
    builder.RegisterService(&service);
    builder.RegisterService(&market_data_service);
    std::unique_ptr<Server> server(builder.BuildAndStart());
    std::cout << "Server listening on " << server_address << std::endl;
    server->Wait();
}

int main(int argc, char** argv) {
    RunServer();
    return 0;
}
