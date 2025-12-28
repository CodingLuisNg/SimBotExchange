import React, { useState } from 'react';

interface OrderEntryProps {
  onPlaceOrder: (side: 'buy' | 'sell', price: number, quantity: number) => void;
}

export const OrderEntry: React.FC<OrderEntryProps> = ({ onPlaceOrder }) => {
  const [price, setPrice] = useState<string>('100.00');
  const [quantity, setQuantity] = useState<string>('1');

  const handleSubmit = (side: 'buy' | 'sell') => {
    const p = parseFloat(price);
    const q = parseFloat(quantity);
    if (!isNaN(p) && !isNaN(q) && q > 0) {
      onPlaceOrder(side, p, q);
    }
  };

  return (
    <div className="ascii-border bg-terminal-bg p-4">
      <div className="text-sm mb-4 pb-2 border-b border-terminal-border">
        +--- ORDER TERMINAL ---+
      </div>

      {/* Price Input */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-terminal-muted">&gt;</span>
          <label className="text-xs text-terminal-muted uppercase tracking-wider">set_price:</label>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-terminal-primary">$</span>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="flex-1 bg-transparent border-0 border-b border-terminal-border text-terminal-primary focus:outline-none focus:border-terminal-primary px-1 py-1 font-mono"
          />
          <span className="cursor-block"></span>
        </div>
      </div>

      {/* Quantity Input */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-terminal-muted">&gt;</span>
          <label className="text-xs text-terminal-muted uppercase tracking-wider">set_quantity:</label>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-terminal-primary">#</span>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="flex-1 bg-transparent border-0 border-b border-terminal-border text-terminal-primary focus:outline-none focus:border-terminal-primary px-1 py-1 font-mono"
          />
          <span className="cursor-block"></span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2">
        <button
          onClick={() => handleSubmit('buy')}
          className="w-full ascii-border text-terminal-primary hover:bg-terminal-primary hover:text-terminal-bg font-bold py-3 px-4 uppercase tracking-wider transition-all duration-150 active:translate-y-px"
        >
          [ BUY --execute ]
        </button>
        <button
          onClick={() => handleSubmit('sell')}
          className="w-full ascii-border text-terminal-secondary hover:bg-terminal-secondary hover:text-terminal-bg font-bold py-3 px-4 uppercase tracking-wider transition-all duration-150 active:translate-y-px"
        >
          [ SELL --execute ]
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-terminal-border">
        <p className="text-xs text-terminal-muted">
          <span className="text-terminal-secondary">[TIP]</span> Orders execute at market price
        </p>
      </div>
    </div>
  );
};
