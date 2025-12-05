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
    return (
        <div className="bg-white p-4 rounded shadow">
            <h3 className="font-bold mb-4">Order Book</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <h4 className="text-sm font-semibold text-gray-500 mb-2">Bids (Buy)</h4>
                    <div className="space-y-1">
                        {bids.length === 0 ? <p className="text-xs text-gray-400">Empty</p> : bids.map((bid, i) => (
                            <div key={i} className="flex justify-between text-sm">
                                <span className="text-green-600">{bid.price.toFixed(2)}</span>
                                <span className="text-gray-600">{bid.quantity}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-gray-500 mb-2">Asks (Sell)</h4>
                    <div className="space-y-1">
                        {asks.length === 0 ? <p className="text-xs text-gray-400">Empty</p> : asks.map((ask, i) => (
                            <div key={i} className="flex justify-between text-sm">
                                <span className="text-red-600">{ask.price.toFixed(2)}</span>
                                <span className="text-gray-600">{ask.quantity}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
