import React, { useState } from 'react';
import {
  AlertOctagon,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Copy,
  FileCode,
  Filter,
  Globe,
  MessageSquare,
  Send,
  Sparkles,
  Tag,
} from 'lucide-react';
import { AdminMetrics, StoredMessage } from '../types';

interface DashboardPageProps {
  metrics: AdminMetrics | null;
  recentMessages: StoredMessage[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onSelectMessage: (messageId: string) => void;
  onOpenSimulator?: () => void;
  onNavigateToMessages: () => void;
}

type FilterCategory =
  | 'ALL'
  | 'GREETINGS'
  | 'HELP'
  | 'ORDER_FORMAT'
  | 'ORDER_MESSAGES'
  | 'STATUS_REQUESTS'
  | 'FAILED';

export const DashboardPage: React.FC<DashboardPageProps> = ({
  metrics,
  recentMessages,
  onSelectMessage,
  onNavigateToMessages,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('ALL');

  // Filter messages based on selected filter tab
  const filteredMessages = recentMessages.filter((msg) => {
    const cat = msg.category || '';
    const status = msg.status || '';
    const replyStatus = msg.replyStatus || '';

    switch (activeFilter) {
      case 'GREETINGS':
        return cat === 'GREETING';
      case 'HELP':
        return cat === 'HELP';
      case 'ORDER_FORMAT':
        return cat === 'ORDER_FORMAT';
      case 'ORDER_MESSAGES':
        return cat === 'VALID_ORDER' || cat === 'INVALID_ORDER';
      case 'STATUS_REQUESTS':
        return cat === 'ORDER_STATUS';
      case 'FAILED':
        return (
          status === 'FAILED' ||
          status === 'REPLY_FAILED' ||
          replyStatus === 'FAILED'
        );
      case 'ALL':
      default:
        return true;
    }
  });

  const getCategoryBadge = (category?: string | null) => {
    switch (category) {
      case 'GREETING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            👋 Greeting
          </span>
        );
      case 'HELP':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            ❓ Help / Menu
          </span>
        );
      case 'ORDER_FORMAT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            📝 Order Format
          </span>
        );
      case 'ORDER_STATUS':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            📦 Order Status
          </span>
        );
      case 'VALID_ORDER':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            ✅ Lens Order (Ack)
          </span>
        );
      case 'IMAGE_ORDER_VERIFICATION':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/30">
            📷 Verify Rx (Buttons)
          </span>
        );
      case 'CONFIRM_ORDER':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            ✅ Order Confirmed
          </span>
        );
      case 'EDIT_ORDER':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
            ✏️ Order Edit Req
          </span>
        );
      case 'INVALID_ORDER':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            ⚠️ Invalid Format
          </span>
        );
      case 'THANK_YOU':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
            😊 Thank You
          </span>
        );
      case 'UNREGISTERED_CUSTOMER':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            ⚠️ Unregistered
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Unknown / Fallback
          </span>
        );
    }
  };

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
            Reply Failed
          </span>
        );
      case 'DUPLICATE_IGNORED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            Duplicate Ignored
          </span>
        );
      case 'REPLY_SELECTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Reply Selected
          </span>
        );
      case 'CLASSIFIED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Classified
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

  const getWebsiteBadge = (website?: string | null) => {
    const name = website || 'Store / Website';
    const isRio = name.toLowerCase().includes('rio');
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${
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
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 p-6 sm:p-8">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center space-x-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400">
              <Bot className="h-3.5 w-3.5" />
              <span>WhatsApp Auto-Reply Engine Active</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              WhatsApp Auto-Reply
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Deterministic, rule-based automatic reply pipeline for customer WhatsApp inquiries.
              Every message is ingested via Meta Webhooks, categorized reliably, and answered
              instantly with real WhatsApp Cloud API messages.
            </p>
          </div>
        </div>

        {/* Ambient Glow */}
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* KPI STAT CARDS (5 Required Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Total Messages Received */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Messages Received</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <MessageSquare className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white">
              {metrics?.totalMessagesReceived ?? metrics?.totalMessages ?? 0}
            </span>
            <span className="text-xs text-slate-400">Total Inbound</span>
          </div>
        </div>

        {/* 2. Total Replies Sent */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Replies Sent</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400">
              <Send className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white">
              {metrics?.totalRepliesSent ?? 0}
            </span>
            <span className="text-xs text-teal-400 font-medium">Dispatched</span>
          </div>
        </div>

        {/* 3. Successful Replies */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 p-5 shadow-sm">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Successful Replies</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
              {metrics?.successfulReplies ?? 0}
            </span>
            <span className="text-xs text-emerald-500 font-medium">Delivered</span>
          </div>
        </div>

        {/* 4. Failed Replies */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Failed Replies</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400">
              <AlertOctagon className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white">
              {metrics?.failedReplies ?? 0}
            </span>
            <span className="text-xs text-rose-400 font-medium">API Errors</span>
          </div>
        </div>

        {/* 5. Duplicate Messages Ignored */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Duplicates Ignored</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <Copy className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-white">
              {metrics?.duplicateMessagesIgnored ?? 0}
            </span>
            <span className="text-xs text-slate-400">Deduped</span>
          </div>
        </div>
      </div>

      {/* EXECUTION PIPELINE (5 Required Stages) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Automatic Reply Execution Pipeline
            </h2>
          </div>
          <span className="text-xs text-slate-500">5 Deterministic Stages</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-3 text-center text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 transition-colors hover:border-slate-700">
            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Stage 1</div>
            <div className="text-slate-100 font-semibold flex items-center justify-center space-x-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-blue-400" />
              <span>Webhook Received</span>
            </div>
            <p className="text-[11px] text-slate-400">Meta Cloud Webhook Verified</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 transition-colors hover:border-slate-700">
            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Stage 2</div>
            <div className="text-slate-100 font-semibold flex items-center justify-center space-x-1.5">
              <FileCode className="h-3.5 w-3.5 text-purple-400" />
              <span>Message Normalized</span>
            </div>
            <p className="text-[11px] text-slate-400">Phone & Text Extracted</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 transition-colors hover:border-slate-700">
            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Stage 3</div>
            <div className="text-slate-100 font-semibold flex items-center justify-center space-x-1.5">
              <Tag className="h-3.5 w-3.5 text-amber-400" />
              <span>Message Classified</span>
            </div>
            <p className="text-[11px] text-slate-400">Rule-Based Deterministic Category</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 transition-colors hover:border-slate-700">
            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Stage 4</div>
            <div className="text-slate-100 font-semibold flex items-center justify-center space-x-1.5">
              <Sparkles className="h-3.5 w-3.5 text-teal-400" />
              <span>Reply Selected</span>
            </div>
            <p className="text-[11px] text-slate-400">Exact Response Template Picked</p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 transition-colors hover:border-slate-700">
            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Stage 5</div>
            <div className="text-slate-100 font-semibold flex items-center justify-center space-x-1.5">
              <Send className="h-3.5 w-3.5 text-emerald-400" />
              <span>WhatsApp Reply Sent</span>
            </div>
            <p className="text-[11px] text-slate-400">Dispatched via Meta Cloud API</p>
          </div>
        </div>
      </div>

      {/* MESSAGE TABLE SECTION WITH FILTERS */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white">WhatsApp Messages & Auto-Replies</h2>
            <p className="text-xs text-slate-400">
              Audit log of all incoming customer messages and corresponding automatic replies
            </p>
          </div>

          <button
            onClick={onNavigateToMessages}
            className="self-start sm:self-auto flex items-center space-x-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <span>View Full Log</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Filters Bar (7 Required Filters) */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-2 pt-1 text-xs scrollbar-none">
          <span className="text-slate-500 font-medium mr-1 flex items-center space-x-1">
            <Filter className="h-3 w-3" />
            <span>Filter:</span>
          </span>

          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeFilter === 'ALL'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            All Messages
          </button>

          <button
            onClick={() => setActiveFilter('GREETINGS')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeFilter === 'GREETINGS'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            👋 Greetings
          </button>

          <button
            onClick={() => setActiveFilter('HELP')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeFilter === 'HELP'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            ❓ Help Requests
          </button>

          <button
            onClick={() => setActiveFilter('ORDER_FORMAT')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeFilter === 'ORDER_FORMAT'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            📝 Order Format Requests
          </button>

          <button
            onClick={() => setActiveFilter('ORDER_MESSAGES')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeFilter === 'ORDER_MESSAGES'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            👓 Order Messages
          </button>

          <button
            onClick={() => setActiveFilter('STATUS_REQUESTS')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeFilter === 'STATUS_REQUESTS'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            📦 Status Requests
          </button>

          <button
            onClick={() => setActiveFilter('FAILED')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeFilter === 'FAILED'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            ❌ Failed Messages
          </button>
        </div>

        {filteredMessages.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl space-y-3">
            <MessageSquare className="h-8 w-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">
              No messages found for category: <span className="font-semibold text-slate-300">{activeFilter}</span>
            </p>
            <p className="text-xs text-slate-500">
              Live WhatsApp messages and automatic replies will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="pb-3 pl-2">Time</th>
                  <th className="pb-3 px-2">Website</th>
                  <th className="pb-3 px-2">Phone Number</th>
                  <th className="pb-3 px-2">Customer Name</th>
                  <th className="pb-3 px-2 max-w-xs">Incoming Message</th>
                  <th className="pb-3 px-2">Detected Category</th>
                  <th className="pb-3 px-2 max-w-sm">Automatic Reply</th>
                  <th className="pb-3 pr-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredMessages.slice(0, 12).map((msg) => (
                  <tr
                    key={msg.id}
                    onClick={() => onSelectMessage(msg.messageId)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  >
                    {/* Timestamp */}
                    <td className="py-3.5 pl-2 text-slate-400 font-mono whitespace-nowrap">
                      <span className="flex items-center space-x-1">
                        <Clock className="h-3 w-3 text-slate-500" />
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                    </td>

                    {/* Website */}
                    <td className="py-3.5 px-2 whitespace-nowrap">
                      {getWebsiteBadge(msg.website || ((msg.rawPayload as Record<string, unknown>)?.storeName as string))}
                    </td>

                    {/* Customer Phone Number */}
                    <td className="py-3.5 px-2 font-mono text-slate-200 font-semibold whitespace-nowrap">
                      +{msg.phone}
                    </td>

                    {/* Customer Name */}
                    <td className="py-3.5 px-2 text-slate-300 whitespace-nowrap font-medium">
                      {msg.customerName || 'Customer'}
                    </td>

                    {/* Incoming Message */}
                    <td className="py-3.5 px-2 max-w-[200px] truncate text-slate-200 font-mono" title={msg.textContent || ''}>
                      {msg.textContent || `[Media: ${msg.messageType}]`}
                    </td>

                    {/* Detected Message Category */}
                    <td className="py-3.5 px-2 whitespace-nowrap">
                      {getCategoryBadge(msg.category)}
                    </td>

                    {/* Automatic Reply */}
                    <td className="py-3.5 px-2 max-w-[260px] truncate text-slate-400 font-mono" title={msg.replyText || ''}>
                      {msg.replyText ? (
                        <span>{msg.replyText.replace(/\n+/g, ' ')}</span>
                      ) : (
                        <span className="text-slate-600 italic">No reply recorded</span>
                      )}
                    </td>

                    {/* Processing Status */}
                    <td className="py-3.5 pr-2 whitespace-nowrap">
                      {getStatusBadge(msg.status)}
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
