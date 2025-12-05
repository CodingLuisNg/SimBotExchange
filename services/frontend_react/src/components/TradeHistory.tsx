import React from 'react';

interface Trade {
    id: string;
    price: number;
    quantity: number;
    side: 'buy' | 'sell';
    timestamp: string;
    status: 'pending' | 'placed' | 'failed' | 'filled';
}

interface TradeHistoryProps {
    trades: Trade[];
}

export const TradeHistory: React.FC<TradeHistoryProps> = ({ trades }) => {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'filled': return 'text-green-600';
            case 'placed': return 'text-blue-600';
            case 'failed': return 'text-red-600';
            default: return 'text-yellow-600';
        }
    };

    return (
        <div className="p-4 border rounded shadow-md bg-white">
            <h2 className="text-xl font-bold mb-4">Trade History</h2>
            <table className="min-w-full">
                <thead>
                    <tr>
                        <th className="text-left">Time</th>
                        <th className="text-left">Side</th>
                        <th className="text-right">Price</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {trades.map((trade) => (
                        <tr key={trade.id} className="border-t">
                            <td className="py-1">{trade.timestamp}</td>
                            <td className={`py-1 ${trade.side === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                                {trade.side.toUpperCase()}
                            </td>
                            <td className="py-1 text-right">{trade.price.toFixed(2)}</td>
                            <td className="py-1 text-right">{trade.quantity}</td>
                            <td className={`py-1 text-right ${getStatusColor(trade.status)}`}>
                                {trade.status.toUpperCase()}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
