import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PriceChartProps {
    lastPrice: number;
    history: number[];
}

export const PriceChart: React.FC<PriceChartProps> = ({ lastPrice, history }) => {
    const data = history.map((price, index) => ({
        time: index,
        price: price
    }));

    // Calculate price change
    const priceChange = history.length > 1 ? lastPrice - history[history.length - 2] : 0;
    const priceChangePercent = history.length > 1 ? ((priceChange / history[history.length - 2]) * 100) : 0;
    const isPositive = priceChange >= 0;

    return (
        <div className="ascii-border bg-terminal-bg p-4 h-96">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-terminal-border">
                <div className="text-sm">
                    +--- PRICE MONITOR ---+
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <div className="text-3xl font-bold text-terminal-primary font-mono">
                            ${lastPrice.toFixed(2)}
                        </div>
                        <div className={`text-xs font-mono ${isPositive ? 'text-terminal-primary' : 'text-terminal-error'}`}>
                            {isPositive ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)} ({priceChangePercent.toFixed(2)}%)
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="h-72 w-full">
                {history.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-terminal-muted">
                        <div className="text-center">
                            <div className="text-4xl mb-2">...</div>
                            <div className="text-xs">// waiting for market data</div>
                        </div>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorPriceTerminal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#33ff00" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#33ff00" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                stroke="#1f521f"
                                strokeDasharray="0"
                                vertical={true}
                                horizontalPoints={[0, 50, 100, 150, 200, 250]}
                            />
                            <XAxis
                                dataKey="time"
                                stroke="#1f521f"
                                tick={{ fill: '#1f521f', fontSize: 10, fontFamily: 'monospace' }}
                                axisLine={{ stroke: '#1f521f' }}
                            />
                            <YAxis
                                domain={['auto', 'auto']}
                                tickFormatter={(val: number) => `$${val.toFixed(2)}`}
                                width={70}
                                stroke="#1f521f"
                                tick={{ fill: '#33ff00', fontSize: 10, fontFamily: 'monospace' }}
                                axisLine={{ stroke: '#1f521f' }}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#0a0a0a',
                                    border: '1px solid #33ff00',
                                    borderRadius: 0,
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    color: '#33ff00',
                                    padding: '8px'
                                }}
                                formatter={(value: number) => [`$${value.toFixed(2)}`, 'price']}
                                labelFormatter={(label) => `tick: ${label}`}
                                cursor={{ stroke: '#33ff00', strokeWidth: 1, strokeDasharray: '5 5' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="price"
                                stroke="#33ff00"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorPriceTerminal)"
                                isAnimationActive={false}
                                dot={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Stats footer */}
            <div className="mt-3 pt-3 border-t border-terminal-border flex justify-between text-xs text-terminal-muted font-mono">
                <span>&gt; samples: {history.length}</span>
                <span>&gt; range: ${Math.min(...history).toFixed(2)} - ${Math.max(...history).toFixed(2)}</span>
            </div>
        </div>
    );
};
