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

    return (
        <div className="p-4 border rounded shadow-md bg-white h-96">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Market Price</h2>
                <div className="text-2xl font-mono font-bold text-blue-600">
                    ${lastPrice.toFixed(2)}
                </div>
            </div>
            <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="time" hide />
                        <YAxis
                            domain={['auto', 'auto']}
                            tickFormatter={(val: number) => `$${val.toFixed(2)}`}
                            width={80}
                        />
                        <Tooltip
                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
                            labelFormatter={() => ''}
                        />
                        <Area
                            type="monotone"
                            dataKey="price"
                            stroke="#2563eb"
                            fillOpacity={1}
                            fill="url(#colorPrice)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
