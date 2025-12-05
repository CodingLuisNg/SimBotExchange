import React from 'react';

interface StockHoldingProps {
    symbol: string;
    quantity: number;
    cashBalance: number;
}

export const StockHolding: React.FC<StockHoldingProps> = ({ symbol, quantity, cashBalance }) => {
    return (
        <div className="bg-white p-4 rounded shadow mb-8">
            <h2 className="text-xl font-bold mb-4">Portfolio</h2>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <h3 className="text-gray-500 text-sm">Cash Balance</h3>
                    <p className="text-2xl font-bold">${cashBalance.toFixed(2)}</p>
                </div>
                <div>
                    <h3 className="text-gray-500 text-sm">Holdings ({symbol})</h3>
                    <p className="text-2xl font-bold">{quantity}</p>
                </div>
            </div>
        </div>
    );
};
