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
    <div className="p-4 border rounded shadow-md bg-white">
      <h2 className="text-xl font-bold mb-4">Place Order</h2>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Price</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2 border"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Quantity</label>
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2 border"
        />
      </div>
      <div className="flex space-x-4">
        <button
          onClick={() => handleSubmit('buy')}
          className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
        >
          Buy
        </button>
        <button
          onClick={() => handleSubmit('sell')}
          className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
        >
          Sell
        </button>
      </div>
    </div>
  );
};
