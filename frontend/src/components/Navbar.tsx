import React from 'react';
import { Activity, Bot, MessageSquare } from 'lucide-react';

interface NavbarProps {
  currentTab: 'dashboard' | 'messages' | 'orders';
  onSelectTab: (tab: 'dashboard' | 'messages' | 'orders') => void;
  onOpenSimulator?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab }) => {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectTab('dashboard')}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-lg shadow-emerald-500/20">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-base font-bold tracking-tight text-white">WhatsApp Auto-Reply</span>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                Multi-Website Hub
              </span>
            </div>
            <p className="text-xs text-slate-400">Meta Cloud Webhook & Auto-Reply Engine</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`flex items-center space-x-2 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
              currentTab === 'dashboard'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Activity className="h-4 w-4" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => onSelectTab('messages')}
            className={`flex items-center space-x-2 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
              currentTab === 'messages'
                ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Messages & Replies</span>
          </button>
        </nav>

        {/* Status Indicator */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live Auto-Reply</span>
          </div>
        </div>
      </div>
    </header>
  );
};
