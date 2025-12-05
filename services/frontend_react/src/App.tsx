import React, { useState, useEffect, useRef } from 'react'
import { OrderEntry } from './components/OrderEntry'
import { PriceChart } from './components/PriceChart'
import { TradeHistory } from './components/TradeHistory'
import { StockHolding } from './components/StockHolding'
import { OrderBook } from './components/OrderBook'

interface OrderBookEntry {
    price: number;
    quantity: number;
}

interface MarketUpdate {
    symbol: string;
    last_price: number;
    volume: number;
    best_bid_price: number;
    best_bid_qty: number;
    best_ask_price: number;
    best_ask_qty: number;
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
}

interface OrderUpdate {
    order_id: string;
    symbol: string;
    price: number;
    quantity: number;
    status: string;
    timestamp: number;
}

function App() {
    const [marketData, setMarketData] = useState<MarketUpdate | null>(null);
    const [priceHistory, setPriceHistory] = useState<number[]>([]);
    const [trades, setTrades] = useState<any[]>([]);
    const [cashBalance, setCashBalance] = useState<number>(1000);
    const [stockHoldings, setStockHoldings] = useState<number>(0);
    const ws = useRef<WebSocket | null>(null);
    const processedFills = useRef<Set<string>>(new Set()); // Track processed order fills
    const tradesRef = useRef<any[]>([]); // Keep a ref to trades for WebSocket handler
    const pendingFills = useRef<Map<string, OrderUpdate>>(new Map()); // Store fills that arrived before trade was created

    // Keep tradesRef in sync with trades state
    useEffect(() => {
        tradesRef.current = trades;
    }, [trades]);

    // Process a fill notification
    const processFill = (update: OrderUpdate, trade: any) => {
        if (processedFills.current.has(update.order_id)) {
            console.log(`⏭️ Already processed fill for ${update.order_id}`);
            return;
        }

        console.log(`✅ Processing fill: ${trade.side} ${trade.quantity} @ ${trade.price} -> ${update.status}`);
        processedFills.current.add(update.order_id);

        // Update holdings
        if (trade.side === 'buy') {
            setStockHoldings(h => {
                const newHoldings = h + trade.quantity;
                console.log(`📈 Added ${trade.quantity} shares. New total: ${newHoldings}`);
                return newHoldings;
            });
        } else {
            const cashReceived = trade.price * trade.quantity;
            setCashBalance(c => {
                const newBalance = c + cashReceived;
                console.log(`💰 Added $${cashReceived.toFixed(2)}. New total: $${newBalance.toFixed(2)}`);
                return newBalance;
            });
        }

        // Update trade status
        setTrades(prev => prev.map(t =>
            t.id === update.order_id ? { ...t, status: 'filled' } : t
        ));
    };

    useEffect(() => {
        // Connect to WebSocket
        const connect = () => {
            const socket = new WebSocket('ws://localhost:8080/ws');
            ws.current = socket;

            socket.onopen = () => {
                console.log('Connected to WebSocket');
            };

            socket.onmessage = (event) => {
                const data = JSON.parse(event.data);

                // Check if it's MarketUpdate or OrderUpdate
                if (data.symbol && data.last_price !== undefined) {
                    // MarketUpdate
                    const update = data as MarketUpdate;
                    setMarketData(update);
                    setPriceHistory(prev => {
                        return [...prev, update.last_price];
                    });
                } else if (data.order_id) {
                    // OrderUpdate (fill notification)
                    const update = data as OrderUpdate;
                    console.log("📢 Order Update received:", update);

                    // Skip if already processed
                    if (processedFills.current.has(update.order_id)) {
                        console.log(`⏭️ Skipping duplicate fill for ${update.order_id}`);
                        return;
                    }

                    // Find the matching trade
                    const matchedTrade = tradesRef.current.find(t => t.id === update.order_id);

                    if (matchedTrade && update.status === "FILLED" && matchedTrade.status !== 'filled') {
                        processFill(update, matchedTrade);
                    } else if (!matchedTrade) {
                        // Trade not created yet - store for later processing
                        console.log(`⏳ Trade not found yet for ${update.order_id}, storing for later...`);
                        pendingFills.current.set(update.order_id, update);
                    }
                }
            };

            socket.onclose = () => {
                console.log('WebSocket disconnected. Retrying...');
                setTimeout(connect, 3000);
            };

            socket.onerror = (err) => {
                console.error('WebSocket error:', err);
                socket.close();
            };
        };

        connect();

        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []);

    const handlePlaceOrder = async (side: 'buy' | 'sell', price: number, quantity: number) => {
        const totalCost = price * quantity;

        // Optimistic checks
        if (side === 'buy' && totalCost > cashBalance) {
            alert("Insufficient funds");
            return;
        }
        if (side === 'sell' && quantity > stockHoldings) {
            alert("Insufficient stock");
            return;
        }

        // Lock funds/stock immediately (optimistic update)
        if (side === 'buy') {
            setCashBalance(prev => prev - totalCost);
        } else {
            setStockHoldings(prev => prev - quantity);
        }

        try {
            const response = await fetch('http://localhost:8080/order', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    symbol: 'TE',
                    side,
                    price,
                    quantity,
                }),
            });
            const result = await response.json();
            console.log("📤 Order response from backend:", result);

            if (result.success) {
                const newTrade = {
                    id: result.order_id,
                    price,
                    quantity,
                    side,
                    timestamp: new Date().toLocaleTimeString(),
                    status: 'placed'
                };
                console.log("📝 Created new trade:", newTrade);
                setTrades(prev => [newTrade, ...prev]);

                // Check if there's a pending fill for this order (arrived before HTTP response)
                const pendingFill = pendingFills.current.get(result.order_id);
                if (pendingFill) {
                    console.log(`🔄 Found pending fill for ${result.order_id}, processing now...`);
                    pendingFills.current.delete(result.order_id);
                    // Process the fill after a small delay to ensure trade is in state
                    setTimeout(() => {
                        processFill(pendingFill, newTrade);
                    }, 10);
                }
            } else {
                // Revert
                if (side === 'buy') {
                    setCashBalance(prev => prev + totalCost);
                } else {
                    setStockHoldings(prev => prev + quantity);
                }
                alert("Order failed: " + result.message);
            }
        } catch (error) {
            console.error("Failed to place order", error);
            // Revert
            if (side === 'buy') {
                setCashBalance(prev => prev + totalCost);
            } else {
                setStockHoldings(prev => prev + quantity);
            }
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">SimBot Exchange</h1>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left Column: Chart & OrderBook */}
                <div className="lg:col-span-3 space-y-8">
                    <PriceChart lastPrice={marketData?.last_price || 0} history={priceHistory} />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <OrderBook bids={marketData?.bids || []} asks={marketData?.asks || []} />

                        {/* Market Stats */}
                        <div className="bg-white p-4 rounded shadow space-y-4">
                            <h3 className="font-bold">Market Stats</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-gray-500 text-sm">Last Price</p>
                                    <p className="text-2xl font-bold">${marketData?.last_price.toFixed(2) || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500 text-sm">Volume</p>
                                    <p className="text-2xl font-bold">{marketData?.volume || '-'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Trading Controls */}
                <div className="space-y-8">
                    <StockHolding symbol="TE" quantity={stockHoldings} cashBalance={cashBalance} />
                    <OrderEntry onPlaceOrder={handlePlaceOrder} />
                    <TradeHistory trades={trades} />
                </div>
            </div>
        </div>
    )
}

export default App
