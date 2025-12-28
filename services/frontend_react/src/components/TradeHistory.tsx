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
    const getStatusSymbol = (status: string) => {
        switch (status) {
            case 'filled': return '[OK]';
            case 'placed': return '[...]';
            case 'failed': return '[ERR]';
            default: return '[???]';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'filled': return 'text-terminal-primary';
            case 'placed': return 'text-terminal-secondary';
            case 'failed': return 'text-terminal-error';
            default: return 'text-terminal-muted';
        }
    };

    return (
        <div className="ascii-border bg-terminal-bg p-4 max-h-96 flex flex-col">
            <div className="text-sm mb-3 pb-2 border-b border-terminal-border">
                +--- TRADE LOG ---+
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-xs">
                {trades.length === 0 ? (
                    <div className="text-terminal-muted italic">
                        // no trades executed yet_
                    </div>
                ) : (
                    trades.map((trade) => (
                        <div key={trade.id} className="ascii-border p-2 hover:bg-terminal-border/20 transition-colors">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-terminal-muted">{trade.timestamp}</span>
                                <span className={getStatusColor(trade.status)}>
                                    {getStatusSymbol(trade.status)}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={trade.side === 'buy' ? 'text-terminal-primary' : 'text-terminal-secondary'}>
                                    {trade.side === 'buy' ? '↑ BUY' : '↓ SELL'}
                                </span>
                                <span className="text-terminal-muted">|</span>
                                <span className="text-terminal-primary">{trade.quantity}x</span>
                                <span className="text-terminal-muted">@</span>
                                <span className="text-terminal-primary">${trade.price.toFixed(2)}</span>
                            </div>
                            <div className="text-terminal-muted text-[10px] mt-1">
                                id: {trade.id.substring(0, 12)}...
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="mt-3 pt-3 border-t border-terminal-border text-terminal-muted text-xs">
                &gt; {trades.length} trade(s) logged
            </div>
        </div>
    );
};
