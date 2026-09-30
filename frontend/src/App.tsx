import { useCallback, useEffect, useState } from 'react';
import { MessageDetailsModal } from './components/MessageDetailsModal';
import { Navbar } from './components/Navbar';
import { WebhookSimulatorModal } from './components/WebhookSimulatorModal';
import { DashboardPage } from './pages/DashboardPage';
import { MessagesPage } from './pages/MessagesPage';
import { OrdersPage } from './pages/OrdersPage';
import { api } from './services/api';
import {
  AdminMetrics,
  MessageDetailsResponse,
  ProcessingStatus,
  StoredMessage,
  StoredOrder,
} from './types';

export function App() {
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'messages' | 'orders'>('dashboard');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [orders, setOrders] = useState<StoredOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMessageDetails, setSelectedMessageDetails] = useState<MessageDetailsResponse | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<ProcessingStatus | undefined>(undefined);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [m, msgList, ordList] = await Promise.all([
        api.getMetrics().catch(() => null),
        api.getMessages(50, 0, selectedStatus).catch(() => ({ items: [], total: 0 })),
        api.getOrders(50, 0).catch(() => ({ items: [], total: 0 })),
      ]);

      if (m) setMetrics(m);
      if (msgList) setMessages(msgList.items);
      if (ordList) setOrders(ordList.items);
    } catch (err) {
      console.error('Error refreshing admin dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus]);

  useEffect(() => {
    loadData();
    // Auto refresh every 8 seconds
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleSelectMessage = async (messageId: string) => {
    try {
      const details = await api.getMessageDetails(messageId);
      setSelectedMessageDetails(details);
    } catch (err) {
      console.error('Failed to load message details:', err);
    }
  };

  const handleSimulationSuccess = (details: MessageDetailsResponse) => {
    loadData();
    setSelectedMessageDetails(details);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
      />

      {/* Main Page Area */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        {currentTab === 'dashboard' && (
          <DashboardPage
            metrics={metrics}
            recentMessages={messages}
            isLoading={isLoading}
            onRefresh={loadData}
            onSelectMessage={handleSelectMessage}
            onNavigateToMessages={() => setCurrentTab('messages')}
          />
        )}

        {currentTab === 'messages' && (
          <MessagesPage
            messages={messages}
            isLoading={isLoading}
            onRefresh={loadData}
            onSelectMessage={handleSelectMessage}
            selectedStatus={selectedStatus}
            onSelectStatus={setSelectedStatus}
          />
        )}

        {currentTab === 'orders' && (
          <OrdersPage
            orders={orders}
            isLoading={isLoading}
            onRefresh={loadData}
            onSelectMessage={handleSelectMessage}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <p>
          Rio ERP WhatsApp Automation Engine • Meta Cloud API Webhook Bridge • Deterministic Optical Parser
        </p>
      </footer>

      {/* Execution Details Modal (Visual Timeline) */}
      <MessageDetailsModal
        data={selectedMessageDetails}
        onClose={() => setSelectedMessageDetails(null)}
      />

      {/* Webhook & Message Simulator Modal */}
      <WebhookSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onSimulationSuccess={handleSimulationSuccess}
      />
    </div>
  );
}

export default App;
