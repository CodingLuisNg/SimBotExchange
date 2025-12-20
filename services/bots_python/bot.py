import grpc
import time
import random
import threading
import sys
import os
from abc import ABC, abstractmethod

# Add generated proto path
sys.path.append(os.path.join(os.path.dirname(__file__), '../../services/backend_go/proto'))
sys.path.append(os.path.join(os.path.dirname(__file__), 'generated'))

try:
    import orderbook_pb2
    import orderbook_pb2_grpc
    import marketdata_pb2
    import marketdata_pb2_grpc
except ImportError:
    print("Proto files not found. Please generate them.")


class TradingBot(ABC):
    """Base class for all trading bots"""

    MIN_PRICE = 1.0  # Price floor - stock can't go below $1

    def __init__(self, bot_id: str, stub, md_stub):
        self.bot_id = bot_id
        self.stub = stub
        self.md_stub = md_stub
        self.last_price = 100.0
        self.best_bid = 99.0
        self.best_ask = 101.0
        self.running = True

    def place_order(self, side, price, quantity):
        """Place an order and return the response"""
        # Enforce price floor
        price = max(price, self.MIN_PRICE)

        order = orderbook_pb2.Order(
            order_id=f"{self.bot_type}-{self.bot_id}-{int(time.time()*1000)}",
            symbol="TE",
            side=side,
            price=round(price, 2),
            quantity=quantity
        )

        try:
            response = self.stub.AddOrder(orderbook_pb2.AddOrderRequest(order=order))
            side_str = 'BUY' if side == orderbook_pb2.SIDE_BUY else 'SELL'
            if response.success:
                print(f"[{self.bot_type}] Bot {self.bot_id}: {side_str} {quantity} @ ${price:.2f}")
            return response
        except Exception as e:
            print(f"[{self.bot_type}] Bot {self.bot_id} order error: {e}")
            return None

    def subscribe_market_data(self):
        """Subscribe to market data updates"""
        def subscribe():
            try:
                stream = self.md_stub.Subscribe(marketdata_pb2.SubscribeRequest(symbol="TE"))
                for update in stream:
                    # Only update prices if they are valid (>= MIN_PRICE)
                    if update.last_price >= self.MIN_PRICE:
                        self.last_price = update.last_price
                    if update.best_bid_price >= self.MIN_PRICE:
                        self.best_bid = update.best_bid_price
                    if update.best_ask_price >= self.MIN_PRICE:
                        self.best_ask = update.best_ask_price
            except Exception as e:
                print(f"[{self.bot_type}] Bot {self.bot_id} subscription error: {e}")

        threading.Thread(target=subscribe, daemon=True).start()

    @property
    @abstractmethod
    def bot_type(self) -> str:
        pass

    @abstractmethod
    def trade(self):
        """Execute one trading cycle"""
        pass

    def run(self):
        """Main bot loop"""
        print(f"[{self.bot_type}] Bot {self.bot_id} started")
        self.subscribe_market_data()
        time.sleep(1)  # Wait for initial market data

        while self.running:
            try:
                self.trade()
            except Exception as e:
                print(f"[{self.bot_type}] Bot {self.bot_id} error: {e}")
            time.sleep(self.trade_interval)

    @property
    def trade_interval(self) -> float:
        return 0.5


class RandomTraderBot(TradingBot):
    """
    Random Trader Bot
    - Places random buy/sell orders around the current price
    - Simulates retail traders with no strategy
    - Fast and aggressive
    """

    @property
    def bot_type(self) -> str:
        return "RANDOM"

    @property
    def trade_interval(self) -> float:
        return random.uniform(0.05, 0.2)  # Very fast trading

    def trade(self):
        side = orderbook_pb2.SIDE_BUY if random.random() > 0.5 else orderbook_pb2.SIDE_SELL
        # Wider price range for more volatility
        price = self.last_price + random.uniform(-5, 5)
        quantity = random.randint(10, 20)  # Larger orders

        self.place_order(side, price, quantity)


class MarketMakerBot(TradingBot):
    """
    Market Maker Bot
    - Provides liquidity by placing both buy and sell orders
    - Profits from the bid-ask spread
    - Trades both sides each cycle
    """

    def __init__(self, bot_id: str, stub, md_stub):
        super().__init__(bot_id, stub, md_stub)
        self.spread = 1.0  # Spread to maintain
        self.order_size = 6  # Larger order size
        self.inventory = 0  # Track net position
        self.max_inventory = 50  # Max position

    @property
    def bot_type(self) -> str:
        return "MM"

    @property
    def trade_interval(self) -> float:
        return 0.8  # Faster trading

    def trade(self):
        mid_price = (self.best_bid + self.best_ask) / 2 if self.best_bid > 0 and self.best_ask > 0 else self.last_price

        # Calculate spread based on inventory risk
        inventory_skew = (self.inventory / self.max_inventory) * 0.5 if self.max_inventory > 0 else 0

        # Adjust prices to manage inventory
        bid_price = mid_price - self.spread / 2 - inventory_skew
        ask_price = mid_price + self.spread / 2 - inventory_skew

        # Place both bid and ask orders (market making)
        # Buy order (bid)
        if self.inventory < self.max_inventory:
            self.place_order(orderbook_pb2.SIDE_BUY, bid_price, self.order_size)
            self.inventory += self.order_size

        # Sell order (ask)
        if self.inventory > -self.max_inventory:
            self.place_order(orderbook_pb2.SIDE_SELL, ask_price, self.order_size)
            self.inventory -= self.order_size

        # Reset inventory tracking periodically
        if abs(self.inventory) > self.max_inventory * 2:
            self.inventory = 0


class MomentumBot(TradingBot):
    """
    Trend Creator Bot (renamed from Momentum Bot)
    - Periodically decides a market direction (strong bull/bull/bear/strong bear)
    - Aggressively pushes the market in that direction
    - Creates trends rather than following them
    - Each trend lasts for a random duration before switching
    """

    def __init__(self, bot_id: str, stub, md_stub):
        super().__init__(bot_id, stub, md_stub)
        self.trend = "neutral"  # strong_bull, bull, bear, strong_bear, neutral
        self.trend_strength = 0  # How aggressive the orders are
        self.trend_duration = 0  # How many more trades in this trend
        self.order_size = 10
        self.decide_new_trend()

    @property
    def bot_type(self) -> str:
        return "TREND"

    @property
    def trade_interval(self) -> float:
        # Faster during strong trends
        if "strong" in self.trend:
            return 0.3
        elif self.trend != "neutral":
            return 0.6
        return 0.9

    def decide_new_trend(self):
        """Randomly decide a new market trend"""
        trends = [
            ("strong_bull", 5, 15),   # trend, strength (price push), duration range
            ("bull", 2, 20),
            ("neutral", 0, 10),
            ("bear", 2, 20),
            ("strong_bear", 5, 15),
        ]

        # Weighted random - strong trends less likely
        weights = [0.15, 0.25, 0.2, 0.25, 0.15]
        choice = random.choices(trends, weights=weights)[0]

        self.trend = choice[0]
        self.trend_strength = choice[1]
        self.trend_duration = random.randint(choice[2], choice[2] * 2)

        print(f"[TREND] Bot {self.bot_id}: New trend: {self.trend.upper()} for ~{self.trend_duration} trades")

    def trade(self):
        # Check if we need a new trend
        self.trend_duration -= 1
        if self.trend_duration <= 0:
            self.decide_new_trend()

        if self.trend == "neutral":
            # Place balanced orders during neutral period
            self.place_order(orderbook_pb2.SIDE_BUY, self.last_price - 1, 3)
            self.place_order(orderbook_pb2.SIDE_SELL, self.last_price + 1, 3)
            return

        # Determine order direction and aggressiveness based on trend
        is_bullish = "bull" in self.trend
        is_strong = "strong" in self.trend

        # Calculate order parameters
        if is_strong:
            # Strong trend: large aggressive orders that will definitely execute
            qty = random.randint(15, 25)
            # Cross the spread to ensure execution
            if is_bullish:
                price = self.best_ask + random.uniform(0.5, 2)  # Pay above ask
            else:
                price = self.best_bid - random.uniform(0.5, 2)  # Sell below bid
        else:
            # Normal trend: moderate orders
            qty = random.randint(8, 15)
            if is_bullish:
                price = self.best_ask + random.uniform(0, 1)
            else:
                price = self.best_bid - random.uniform(0, 1)

        # Place the trend-driving order
        side = orderbook_pb2.SIDE_BUY if is_bullish else orderbook_pb2.SIDE_SELL
        self.place_order(side, price, qty)

        # Sometimes place a second order in the same direction for extra push
        if is_strong and random.random() > 0.5:
            extra_qty = random.randint(5, 10)
            if is_bullish:
                extra_price = self.best_ask + random.uniform(1, 3)
            else:
                extra_price = self.best_bid - random.uniform(1, 3)
            self.place_order(side, extra_price, extra_qty)


def create_bot(bot_type: str, bot_id: str, stub, md_stub) -> TradingBot:
    """Factory function to create bots"""
    bot_types = {
        'random': RandomTraderBot,
        'mm': MarketMakerBot,
        'market_maker': MarketMakerBot,
        'momentum': MomentumBot,
    }

    bot_class = bot_types.get(bot_type.lower(), RandomTraderBot)
    return bot_class(bot_id, stub, md_stub)


def run_bot(bot_id: str, bot_type: str = 'random'):
    """Main function to run a bot"""
    backend_addr = os.environ.get('BACKEND_ADDR', 'localhost:50051')
    channel = grpc.insecure_channel(backend_addr)
    stub = orderbook_pb2_grpc.MatchingEngineStub(channel)
    md_stub = marketdata_pb2_grpc.MarketDataServiceStub(channel)

    print(f"Connecting to {backend_addr}...")

    bot = create_bot(bot_type, bot_id, stub, md_stub)
    bot.run()


if __name__ == '__main__':
    # Get bot configuration from environment variables
    bot_id = os.environ.get('BOT_ID', '1')
    bot_type = os.environ.get('BOT_TYPE', 'random')  # random, mm, momentum

    print(f"""
╔════════════════════════════════════════╗
║     Fake Trading Market Bot            ║
╠════════════════════════════════════════╣
║  Bot ID:   {bot_id:<27} ║
║  Type:     {bot_type.upper():<27} ║
╚════════════════════════════════════════╝
    """)

    run_bot(bot_id, bot_type)
