import React from 'react';

interface StockHoldingProps {
    symbol: string;
    quantity: number;
    cashBalance: number;
}

export const StockHolding: React.FC<StockHoldingProps> = ({ symbol, quantity, cashBalance }) => {
    // Calculate portfolio percentage (cash vs holdings)
    const totalValue = cashBalance + (quantity * 100); // Assuming avg price of $100 for visualization
    const cashPercent = totalValue > 0 ? Math.round((cashBalance / totalValue) * 100) : 100;
    const holdingsPercent = 100 - cashPercent;

    return (
        <div className="ascii-border bg-terminal-bg p-4">
            <div className="text-sm mb-4 pb-2 border-b border-terminal-border">
                +--- PORTFOLIO STATUS ---+
            </div>

            {/* Cash Balance */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-terminal-muted">&gt; cash_balance:</span>
                    <span className="text-terminal-secondary text-xs">[{cashPercent}%]</span>
                </div>
                <div className="text-2xl font-bold text-terminal-primary mb-1">
                    ${cashBalance.toFixed(2)}
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-xs text-terminal-muted">[</span>
                    <div className="flex-1 h-2 bg-terminal-bg border border-terminal-border">
                        <div
                            className="h-full bg-terminal-secondary"
                            style={{ width: `${cashPercent}%` }}
                        ></div>
                    </div>
                    <span className="text-xs text-terminal-muted">]</span>
                </div>
            </div>

            {/* Holdings */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-terminal-muted">&gt; holdings_{symbol.toLowerCase()}:</span>
                    <span className="text-terminal-primary text-xs">[{holdingsPercent}%]</span>
                </div>
                <div className="text-2xl font-bold text-terminal-primary mb-1">
                    {quantity} <span className="text-base text-terminal-muted">shares</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-xs text-terminal-muted">[</span>
                    <div className="flex-1 h-2 bg-terminal-bg border border-terminal-border">
                        <div
                            className="h-full bg-terminal-primary"
                            style={{ width: `${holdingsPercent}%` }}
                        ></div>
                    </div>
                    <span className="text-xs text-terminal-muted">]</span>
                </div>
            </div>

            <div className="pt-3 border-t border-terminal-border">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-terminal-muted">total_value:</span>
                    <span className="text-terminal-primary">${totalValue.toFixed(2)}</span>
                </div>
            </div>
        </div>
    );
};
