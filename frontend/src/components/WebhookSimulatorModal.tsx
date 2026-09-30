import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  HelpCircle,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  UserX,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import { MessageDetailsResponse, SimulationResult } from '../types';

interface WebhookSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulationSuccess: (details: MessageDetailsResponse) => void;
}

const PRESETS = [
  {
    id: 'greeting',
    title: '1. Greeting (Hello)',
    badge: 'Greeting',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: <Bot className="h-4 w-4 text-emerald-400" />,
    phone: '919876543210',
    customerName: 'ABC Optical',
    text: 'Hello',
  },
  {
    id: 'help',
    title: '2. Help / Menu',
    badge: 'Help Flow',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    icon: <HelpCircle className="h-4 w-4 text-blue-400" />,
    phone: '919876543210',
    customerName: 'ABC Optical',
    text: 'Help',
  },
  {
    id: 'order-format',
    title: '3. Order Format Request',
    badge: 'Format',
    badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    icon: <Sparkles className="h-4 w-4 text-purple-400" />,
    phone: '919876543210',
    customerName: 'ABC Optical',
    text: 'Order format',
  },
  {
    id: 'order-status',
    title: '4. Order Status Check',
    badge: 'Live Status',
    badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    icon: <MessageSquare className="h-4 w-4 text-cyan-400" />,
    phone: '917718043078',
    customerName: 'Ash',
    text: 'STATUS SO-2026-479435957',
  },
  {
    id: 'valid-order',
    title: '5. Valid Lens Order (Ack)',
    badge: 'Order Ack',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
    phone: '919876543210',
    customerName: 'ABC Optical',
    text: `ORDER Ref: ASH\nR: -1.00 / -0.50 × 90\nL: -1.25 / -0.25 × 180\nBluecut 1.56 Progressive Add: +2.00`,
  },
  {
    id: 'invalid-order',
    title: '6. Invalid Order Format',
    badge: 'Format Error',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
    phone: '919876543210',
    customerName: 'ABC Optical',
    text: 'ORDER Ref: ASH\nR: -1.00 cyl',
  },
  {
    id: 'thank-you',
    title: '7. Thank You',
    badge: 'Thanks',
    badgeColor: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    icon: <Sparkles className="h-4 w-4 text-teal-400" />,
    phone: '919876543210',
    customerName: 'ABC Optical',
    text: 'Thank you so much',
  },
  {
    id: 'unregistered',
    title: '8. Unregistered Customer',
    badge: 'Unregistered',
    badgeColor: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    icon: <UserX className="h-4 w-4 text-orange-400" />,
    phone: '919900000000',
    customerName: 'New Guest',
    text: 'Hi I want to order lenses',
  },
  {
    id: 'unknown',
    title: '9. Unknown Message',
    badge: 'Fallback',
    badgeColor: 'bg-slate-800 text-slate-400 border-slate-700',
    icon: <HelpCircle className="h-4 w-4 text-slate-400" />,
    phone: '919876543210',
    customerName: 'ABC Optical',
    text: 'What is the weather today in Mumbai?',
  },
  {
    id: 'image-order',
    title: '10. Prescription Image Order',
    badge: 'Vision OCR',
    badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    icon: <Camera className="h-4 w-4 text-indigo-400" />,
    phone: '917718043078',
    customerName: 'Ash',
    text: '',
    messageType: 'image',
  },
];

export const WebhookSimulatorModal: React.FC<WebhookSimulatorModalProps> = ({
  isOpen,
  onClose,
  onSimulationSuccess,
}) => {
  const [phone, setPhone] = useState('919876543210');
  const [customerName, setCustomerName] = useState('ABC Optical');
  const [text, setText] = useState('Hello');
  const [messageType, setMessageType] = useState<'text' | 'image'>('text');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<SimulationResult | null>(null);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: (typeof PRESETS)[0]) => {
    setPhone(preset.phone);
    setCustomerName(preset.customerName);
    setText(preset.text);
    setMessageType(((preset as any).messageType as 'text' | 'image') || 'text');
    setError(null);
    setLastResult(null);
  };

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || (!text && messageType !== 'image')) return;

    setIsLoading(true);
    setError(null);
    setLastResult(null);

    try {
      const response = await api.simulateMessage({
        phone,
        text: text || undefined,
        customerName: customerName || undefined,
        messageType,
        mediaId: messageType === 'image' ? 'sim_image_presc_01' : undefined,
      });

      setLastResult(response);
      onSimulationSuccess(response.details);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-lg shadow-emerald-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Live Auto-Reply Webhook Simulator</h3>
              <p className="text-xs text-slate-400">
                Trigger incoming WhatsApp messages and test the 5-stage auto-reply pipeline live
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* Quick Presets */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">
              Select 1-Click Message Scenario:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-left hover:border-emerald-500/40 hover:bg-slate-800/40 transition-all text-xs"
                >
                  <div className="flex items-center space-x-2 truncate">
                    {preset.icon}
                    <span className="font-medium text-slate-200 truncate">{preset.title}</span>
                  </div>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold border ${preset.badgeColor} whitespace-nowrap ml-1`}
                  >
                    {preset.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSimulate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  WhatsApp Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 919876543210"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Registered: 919876543210 • Unregistered: 919900000000
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Customer Profile Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. ABC Optical"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  {messageType === 'image' ? 'Optional Image Caption' : 'WhatsApp Message Body'}
                </label>
                {messageType === 'image' && (
                  <span className="flex items-center space-x-1 text-[11px] text-indigo-400 font-medium">
                    <Camera className="h-3.5 w-3.5" />
                    <span>Prescription Image Attached</span>
                  </span>
                )}
              </div>

              {messageType === 'image' && (
                <div className="mb-2 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 text-xs text-indigo-200 space-y-1">
                  <div className="font-semibold text-indigo-300 flex items-center space-x-1.5">
                    <Camera className="h-4 w-4" />
                    <span>Optical Prescription Image Recognition Active</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Simulates a customer sending a photo of an optical slip or ordering screen. Vision OCR automatically extracts Right/Left SPH, CYL, AXIS, ADD and places the order in Rio ERP.
                  </p>
                </div>
              )}

              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={messageType === 'image' ? 2 : 3}
                placeholder={messageType === 'image' ? 'Optional caption (e.g. Please deliver urgent)...' : 'Enter customer message...'}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                required={messageType !== 'image'}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-rose-900/50 bg-rose-950/40 p-3 text-xs text-rose-300">
                {error}
              </div>
            )}

            {lastResult && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Auto-Reply Pipeline Completed</span>
                  </span>
                  <span className="text-xs font-mono font-bold bg-slate-900 px-2 py-0.5 rounded text-emerald-300 border border-emerald-500/30">
                    Status: {lastResult.result.status}
                  </span>
                </div>

                {lastResult.result.category && (
                  <div className="text-xs text-slate-300 flex items-center space-x-2">
                    <span className="text-slate-400">Detected Category:</span>
                    <span className="font-semibold text-emerald-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-mono">
                      {lastResult.result.category}
                    </span>
                  </div>
                )}

                {lastResult.details.message?.replyText && (
                  <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">
                      Dispatched WhatsApp Reply:
                    </span>
                    {lastResult.details.message.replyText}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Close
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center space-x-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing Auto-Reply...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Message & Auto-Reply</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
