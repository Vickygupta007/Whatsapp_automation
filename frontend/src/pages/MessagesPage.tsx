import React, { useState } from 'react';
import { Clock, Filter, Globe, MessageSquare, RefreshCw, Search } from 'lucide-react';
import { ProcessingStatus, StoredMessage } from '../types';

interface MessagesPageProps {
  messages: StoredMessage[];
  isLoading: boolean;
  onRefresh: () => void;
  onSelectMessage: (messageId: string) => void;
  selectedStatus?: ProcessingStatus;
  onSelectStatus: (status?: ProcessingStatus) => void;
}

const STATUS_OPTIONS: ProcessingStatus[] = [
  'RECEIVED',
  'NORMALIZED',
  'CLASSIFIED',
  'REPLY_SELECTED',
  'REPLY_SENT',
  'REPLY_FAILED',
  'DUPLICATE_IGNORED',
  'FAILED',
];

export const MessagesPage: React.FC<MessagesPageProps> = ({
  messages,
  isLoading,
  onRefresh,
  onSelectMessage,
  selectedStatus,
  onSelectStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedWebsite, setSelectedWebsite] = useState<string>('');

  // Extract all distinct website / store names present in the messages
  const availableWebsites = Array.from(
    new Set(
      messages
        .map((m) => m.website || (m.rawPayload as Record<string, unknown>)?.storeName as string || 'Rio Digital Lenses')
        .filter(Boolean)
    )
  );

  const filteredMessages = messages.filter((msg) => {
    const msgWebsite = msg.website || ((msg.rawPayload as Record<string, unknown>)?.storeName as string) || 'Rio Digital Lenses';

    const matchesSearch =
      msg.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (msg.textContent && msg.textContent.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (msg.customerName && msg.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (msg.category && msg.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (msg.replyText && msg.replyText.toLowerCase().includes(searchTerm.toLowerCase())) ||
      msgWebsite.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.messageId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = !selectedStatus || msg.status === selectedStatus;
    const matchesCategory = !selectedCategory || msg.category === selectedCategory;
    const matchesWebsite = !selectedWebsite || msgWebsite === selectedWebsite;

    return matchesSearch && matchesStatus && matchesCategory && matchesWebsite;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'REPLY_SENT':
      case 'CONFIRMATION_SENT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Reply Sent
          </span>
        );
      case 'REPLY_FAILED':
      case 'FAILED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Failed
          </span>
        );
      case 'DUPLICATE_IGNORED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Duplicate
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const getCategoryBadge = (category?: string | null) => {
    if (!category) {
      return <span className="text-slate-500 italic">None</span>;
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
        {category}
      </span>
    );
  };

  const getWebsiteBadge = (website?: string | null) => {
    const name = website || 'Rio Digital Lenses';
    const isRio = name.toLowerCase().includes('rio');
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap ${
          isRio
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
        }`}
      >
        <Globe className="h-3 w-3 shrink-0" />
        <span>{name}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Inbound Messages & Auto-Replies</h1>
          <p className="text-xs text-slate-400">
            Full audit log of customer messages received via Meta WhatsApp Cloud API and auto-reply dispatch status
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

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by phone, website, customer, message, or category..."
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Website / Store Filter */}
        <div className="relative w-full sm:w-48">
          <Globe className="absolute left-3.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
          <select
            value={selectedWebsite}
            onChange={(e) => setSelectedWebsite(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-8 py-2.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Websites</option>
            {availableWebsites.map((site) => (
              <option key={site} value={site}>
                {site}
              </option>
            ))}
          </select>
        </div>

        {/* Category Filter */}
        <div className="relative w-full sm:w-44">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Categories</option>
            <option value="GREETING">GREETING</option>
            <option value="HELP">HELP</option>
            <option value="ORDER_FORMAT">ORDER_FORMAT</option>
            <option value="ORDER_STATUS">ORDER_STATUS</option>
            <option value="IMAGE_ORDER_VERIFICATION">IMAGE_ORDER_VERIFICATION</option>
            <option value="CONFIRM_ORDER">CONFIRM_ORDER</option>
            <option value="EDIT_ORDER">EDIT_ORDER</option>
            <option value="VALID_ORDER">VALID_ORDER</option>
            <option value="INVALID_ORDER">INVALID_ORDER</option>
            <option value="THANK_YOU">THANK_YOU</option>
            <option value="UNREGISTERED_CUSTOMER">UNREGISTERED_CUSTOMER</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="relative w-full sm:w-44">
          <Filter className="absolute left-3.5 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
          <select
            value={selectedStatus || ''}
            onChange={(e) => onSelectStatus((e.target.value as ProcessingStatus) || undefined)}
            className="w-full appearance-none rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-8 py-2.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        {filteredMessages.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <MessageSquare className="h-8 w-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">No messages match the selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold bg-slate-900/40">
                  <th className="py-3.5 pl-4">Time</th>
                  <th className="py-3.5 px-3">Website</th>
                  <th className="py-3.5 px-3">Phone Number</th>
                  <th className="py-3.5 px-3">Customer</th>
                  <th className="py-3.5 px-3 max-w-xs">Customer Message</th>
                  <th className="py-3.5 px-3">Category</th>
                  <th className="py-3.5 px-3 max-w-sm">Auto-Reply Text</th>
                  <th className="py-3.5 pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredMessages.map((msg) => (
                  <tr
                    key={msg.id}
                    onClick={() => onSelectMessage(msg.messageId)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    {/* 1. Time */}
                    <td className="py-3.5 pl-4 font-mono text-slate-400 whitespace-nowrap">
                      <span className="flex items-center space-x-1">
                        <Clock className="h-3 w-3 text-slate-500" />
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    </td>

                    {/* 2. Website (Right side of Time) */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {getWebsiteBadge(msg.website || ((msg.rawPayload as Record<string, unknown>)?.storeName as string))}
                    </td>

                    {/* 3. Phone Number */}
                    <td className="py-3.5 px-3 font-mono text-slate-200 font-semibold whitespace-nowrap">
                      +{msg.phone}
                    </td>

                    {/* 4. Customer Name */}
                    <td className="py-3.5 px-3 text-slate-300 whitespace-nowrap font-medium">
                      {msg.customerName || 'Customer'}
                    </td>

                    {/* 5. Customer Message */}
                    <td className="py-3.5 px-3 max-w-[200px] truncate text-slate-200 font-mono" title={msg.textContent || ''}>
                      {msg.textContent || `[${msg.messageType}]`}
                    </td>

                    {/* 6. Category */}
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {getCategoryBadge(msg.category)}
                    </td>

                    {/* 7. Auto-Reply Text */}
                    <td className="py-3.5 px-3 max-w-[240px] truncate text-slate-400 font-mono" title={msg.replyText || ''}>
                      {msg.replyText ? msg.replyText.replace(/\n+/g, ' ') : <span className="text-slate-600 italic">None</span>}
                    </td>

                    {/* 8. Status */}
                    <td className="py-3.5 pr-4 whitespace-nowrap">{getStatusBadge(msg.status)}</td>
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
