import React, { useState } from 'react';
import { Clock, ExternalLink, PackageCheck, RefreshCw, Search } from 'lucide-react';
import { StoredOrder } from '../types';

interface OrdersPageProps {
  orders: StoredOrder[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectMessage: (messageId: string) => void;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({
  orders,
  isLoading,
  onRefresh,
  onSelectMessage,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOrders = orders.filter((ord) => {
    const term = searchTerm.toLowerCase();
    return (
      (ord.erpOrderId && ord.erpOrderId.toLowerCase().includes(term)) ||
      (ord.customerRefNo && ord.customerRefNo.toLowerCase().includes(term)) ||
      (ord.product && ord.product.toLowerCase().includes(term)) ||
      ord.phone.toLowerCase().includes(term) ||
      (ord.lensType && ord.lensType.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Rio ERP Optical Orders</h1>
          <p className="text-xs text-slate-400">
            Work orders successfully generated and dispatched into Rio ERP from WhatsApp prescriptions
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="self-start sm:self-auto flex items-center space-x-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700/80 px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by ERP Order ID, patient reference, product, or phone number..."
          className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        {filteredOrders.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <PackageCheck className="h-8 w-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">No optical orders found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold bg-slate-900/40">
                  <th className="py-3.5 pl-4">Created</th>
                  <th className="py-3.5">Rio ERP Order ID</th>
                  <th className="py-3.5">Customer / Ref</th>
                  <th className="py-3.5">Phone</th>
                  <th className="py-3.5">Product</th>
                  <th className="py-3.5">Lens Type</th>
                  <th className="py-3.5">Index</th>
                  <th className="py-3.5">Coating</th>
                  <th className="py-3.5">Status</th>
                  <th className="py-3.5 pr-4 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredOrders.map((ord) => (
                  <tr
                    key={ord.id}
                    onClick={() => onSelectMessage(ord.messageId)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 pl-4 font-mono text-slate-400 whitespace-nowrap">
                      <span className="flex items-center space-x-1">
                        <Clock className="h-3 w-3 text-slate-500" />
                        <span>{new Date(ord.createdAt).toLocaleTimeString()}</span>
                      </span>
                    </td>
                    <td className="py-3.5 font-mono text-emerald-400 font-bold whitespace-nowrap">
                      <span className="flex items-center space-x-1">
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>{ord.erpOrderId || 'QUEUED'}</span>
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-200 font-semibold whitespace-nowrap">
                      {ord.customerRefNo || 'N/A'}
                    </td>
                    <td className="py-3.5 font-mono text-slate-300 whitespace-nowrap">
                      +{ord.phone}
                    </td>
                    <td className="py-3.5 text-slate-300 whitespace-nowrap">
                      {ord.product || 'Optical Lens'}
                    </td>
                    <td className="py-3.5 text-slate-300 whitespace-nowrap">
                      {ord.lensType || 'Single Vision'}
                    </td>
                    <td className="py-3.5 font-mono text-slate-300 whitespace-nowrap">
                      {ord.index || '-'}
                    </td>
                    <td className="py-3.5 text-slate-300 whitespace-nowrap">
                      {ord.coating || '-'}
                    </td>
                    <td className="py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {ord.status}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 text-right whitespace-nowrap">
                      <span className="text-emerald-400 font-medium hover:underline">
                        Details →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
