import React from 'react';

interface OrderBookEntry {
    price: number;
    quantity: number;
}

interface OrderBookProps {
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
}

export const OrderBook: React.FC<OrderBookProps> = ({ bids, asks }) => {
    // Calculate max quantity for depth visualization
    const maxBidQty = Math.max(...bids.map(b => b.quantity), 1);
    const maxAskQty = Math.max(...asks.map(a => a.quantity), 1);

    return (
        <div className="ascii-border bg-terminal-bg p-4">
            <div className="text-sm mb-3 pb-2 border-b border-terminal-border">
                +--- ORDER BOOK DEPTH ---+
            </div>

            <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                {/* Bids */}
                <div>
                    <div className="text-terminal-primary mb-2 font-bold uppercase tracking-wider">
                        &gt; BIDS
                    </div>
                    <div className="space-y-1">
                        {bids.length === 0 ? (
                            <p className="text-terminal-muted italic">// no bids</p>
                        ) : (
                            bids.slice(0, 10).map((bid, i) => {
                                const depthPercent = (bid.quantity / maxBidQty) * 100;
                                return (
                                    <div key={i} className="relative">
                                        {/* Depth bar */}
                                        <div
                                            className="absolute inset-0 bg-terminal-primary/10 border-l-2 border-terminal-primary"
                                            style={{ width: `${depthPercent}%` }}
                                        ></div>
                                        {/* Content */}
                                        <div className="relative flex justify-between items-center px-2 py-1">
                                            <span className="text-terminal-primary font-bold">
                                                ${bid.price.toFixed(2)}
                                            </span>
                                            <span className="text-terminal-muted">
                                                {bid.quantity}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Asks */}
                <div>
                    <div className="text-terminal-secondary mb-2 font-bold uppercase tracking-wider">
                        &gt; ASKS
                    </div>
                    <div className="space-y-1">
                        {asks.length === 0 ? (
                            <p className="text-terminal-muted italic">// no asks</p>
                        ) : (
                            asks.slice(0, 10).map((ask, i) => {
                                const depthPercent = (ask.quantity / maxAskQty) * 100;
                                return (
                                    <div key={i} className="relative">
                                        {/* Depth bar */}
                                        <div
                                            className="absolute inset-0 bg-terminal-secondary/10 border-r-2 border-terminal-secondary"
                                            style={{ width: `${depthPercent}%`, right: 0, left: 'auto' }}
                                        ></div>
                                        {/* Content */}
                                        <div className="relative flex justify-between items-center px-2 py-1">
                                            <span className="text-terminal-secondary font-bold">
                                                ${ask.price.toFixed(2)}
                                            </span>
                                            <span className="text-terminal-muted">
                                                {ask.quantity}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-3 pt-3 border-t border-terminal-border text-terminal-muted text-xs">
                &gt; spread: {bids.length && asks.length ? `$${(asks[0].price - bids[0].price).toFixed(2)}` : 'N/A'}
            </div>
        </div>
    );
};
