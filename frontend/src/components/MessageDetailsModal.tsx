import React, { useState } from 'react';
import {
  Bot,
  Calendar,
  CheckCircle,
  Copy,
  MessageSquare,
  Phone,
  Send,
  Tag,
  User,
  X,
} from 'lucide-react';
import { MessageDetailsResponse } from '../types';
import { ExecutionFlowTimeline } from './ExecutionFlowTimeline';

interface MessageDetailsModalProps {
  data: MessageDetailsResponse | null;
  onClose: () => void;
}

export const MessageDetailsModal: React.FC<MessageDetailsModalProps> = ({ data, onClose }) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'reply' | 'raw'>('timeline');
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  const { message, logs } = data;

  const copyMessageId = () => {
    navigator.clipboard.writeText(message.messageId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-emerald-400 border border-slate-700">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white">Auto-Reply Inspector</h3>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-mono text-emerald-400 border border-slate-700">
                  {message.status}
                </span>
                {message.category && (
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/20">
                    {message.category}
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
                <span>{message.messageId}</span>
                <button
                  onClick={copyMessageId}
                  className="hover:text-emerald-400 transition-colors"
                  title="Copy Message ID"
                >
                  {copied ? <CheckCircle className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Quick Meta Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 border-b border-slate-800 bg-slate-950/40 text-xs">
          <div className="flex items-center space-x-2 text-slate-300">
            <Phone className="h-4 w-4 text-emerald-400" />
            <span>+{message.phone}</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-300">
            <User className="h-4 w-4 text-teal-400" />
            <span>{message.customerName || 'Customer'}</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-300">
            <Calendar className="h-4 w-4 text-blue-400" />
            <span>{new Date(message.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center space-x-2 text-emerald-400 font-semibold font-mono">
            <Tag className="h-4 w-4" />
            <span>{message.category || 'PENDING'}</span>
          </div>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-900">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'timeline'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Execution Flow (5 Stages)
          </button>

          <button
            onClick={() => setActiveTab('reply')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'reply'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Incoming Message & Auto-Reply
          </button>

          <button
            onClick={() => setActiveTab('raw')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'raw'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Raw Payloads & Logs
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'timeline' && (
            <ExecutionFlowTimeline logs={logs} currentStatus={message.status} />
          )}

          {activeTab === 'reply' && (
            <div className="space-y-4">
              {/* Incoming Message Box */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span className="flex items-center space-x-1.5 text-blue-400">
                    <MessageSquare className="h-4 w-4" />
                    <span>Customer Incoming Message</span>
                  </span>
                  <span className="font-mono text-slate-500">+{message.phone}</span>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-100 whitespace-pre-wrap">
                  {message.textContent || `[${message.messageType.toUpperCase()}]`}
                </div>
              </div>

              {/* Detected Category */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400">Detected Business Category</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {message.category || 'UNKNOWN'}
                  </div>
                </div>
                <div className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                  Rule-based Deterministic Match
                </div>
              </div>

              {/* Dispatched WhatsApp Auto-Reply */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                  <span className="flex items-center space-x-1.5">
                    <Send className="h-4 w-4" />
                    <span>Dispatched WhatsApp Auto-Reply</span>
                  </span>
                  <span className="font-mono text-xs font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded">
                    Status: {message.replyStatus || 'SENT'}
                  </span>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-950 border border-emerald-500/30 text-xs font-mono text-emerald-200 whitespace-pre-wrap leading-relaxed">
                  {message.replyText || 'No reply text recorded'}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="space-y-4 text-xs font-mono">
              <div>
                <h4 className="font-sans font-semibold text-slate-300 mb-2">
                  Normalized Message Object
                </h4>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 overflow-x-auto text-emerald-400">
                  <pre>{JSON.stringify(message, null, 2)}</pre>
                </div>
              </div>

              <div>
                <h4 className="font-sans font-semibold text-slate-300 mb-2">
                  All Processing Logs ({logs.length})
                </h4>
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 overflow-x-auto text-slate-300 max-h-60 overflow-y-auto">
                  <pre>{JSON.stringify(logs, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
