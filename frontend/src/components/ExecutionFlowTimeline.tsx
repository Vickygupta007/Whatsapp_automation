import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileCode,
  MessageSquare,
  Send,
  Sparkles,
  Tag,
  XCircle,
} from 'lucide-react';
import { PipelineStep, ProcessingLog } from '../types';

interface ExecutionFlowTimelineProps {
  logs: ProcessingLog[];
  currentStatus: string;
}

interface StepConfig {
  id: PipelineStep;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: StepConfig[] = [
  {
    id: 'WEBHOOK',
    title: '1. Webhook Received',
    description: 'Received raw WhatsApp payload from Meta Cloud API',
    icon: <MessageSquare className="h-4 w-4" />,
  },
  {
    id: 'NORMALIZATION',
    title: '2. Message Normalized',
    description: 'Extracted phone, customer name, and normalized message content',
    icon: <FileCode className="h-4 w-4" />,
  },
  {
    id: 'CLASSIFICATION',
    title: '3. Message Classified',
    description: 'Deterministic rule-based classification into business category',
    icon: <Tag className="h-4 w-4" />,
  },
  {
    id: 'REPLY_SELECTION',
    title: '4. Reply Selected',
    description: 'Selected appropriate pre-defined auto-reply response template',
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    id: 'WHATSAPP_REPLY',
    title: '5. WhatsApp Reply Sent',
    description: 'Dispatched automatic response to customer via Meta WhatsApp Cloud API',
    icon: <Send className="h-4 w-4" />,
  },
];

export const ExecutionFlowTimeline: React.FC<ExecutionFlowTimelineProps> = ({ logs, currentStatus }) => {
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const toggleExpand = (stepId: string) => {
    setExpandedSteps((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  // Map logs to step IDs
  const logsByStep: Record<string, ProcessingLog> = {};
  for (const log of logs) {
    logsByStep[log.step] = log;
  }

  return (
    <div className="space-y-4">
      <div className="relative border-l-2 border-slate-800 ml-4 space-y-6 pb-2">
        {STEPS.map((step) => {
          const log = logsByStep[step.id];
          const hasRun = !!log;
          const isSuccess = log?.status === 'SUCCESS';
          const isFailed = log?.status === 'FAILED';
          const isSkipped = log?.status === 'SKIPPED';
          const isExpanded = !!expandedSteps[step.id];

          // Determine node icon and border
          let statusBadge = (
            <div className="h-3 w-3 rounded-full bg-slate-700 ring-4 ring-slate-900" />
          );
          let borderColor = 'border-slate-800';

          if (isSuccess) {
            statusBadge = <CheckCircle2 className="h-5 w-5 text-emerald-400 bg-slate-900 rounded-full" />;
            borderColor = 'border-emerald-500/30';
          } else if (isFailed) {
            statusBadge = <XCircle className="h-5 w-5 text-rose-500 bg-slate-900 rounded-full" />;
            borderColor = 'border-rose-500/30';
          } else if (isSkipped) {
            statusBadge = <AlertCircle className="h-5 w-5 text-amber-400 bg-slate-900 rounded-full" />;
            borderColor = 'border-amber-500/30';
          }

          return (
            <div key={step.id} className="relative pl-7 group">
              {/* Timeline marker */}
              <div className="absolute -left-[11px] top-1 flex items-center justify-center">
                {statusBadge}
              </div>

              {/* Step Card */}
              <div
                className={`rounded-xl border ${borderColor} bg-slate-900/60 p-4 shadow-sm transition-all hover:border-slate-700`}
              >
                <div
                  className="flex items-center justify-between cursor-pointer select-none"
                  onClick={() => toggleExpand(step.id)}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        isSuccess
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : isFailed
                          ? 'bg-rose-500/10 text-rose-400'
                          : isSkipped
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {step.icon}
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-200">{step.title}</h4>
                      <p className="text-xs text-slate-400">{step.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {hasRun && (
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          isSuccess
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isFailed
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {log.status}
                      </span>
                    )}

                    {!hasRun && (
                      <span className="text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded">
                        Pending
                      </span>
                    )}

                    {hasRun && (
                      <button className="text-slate-400 hover:text-slate-200">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Error Banner if failed */}
                {isFailed && log.errorMessage && (
                  <div className="mt-3 rounded-lg bg-rose-950/40 border border-rose-900/50 p-3 text-xs text-rose-300">
                    <span className="font-semibold text-rose-200">Failure Reason: </span>
                    {log.errorMessage}
                  </div>
                )}

                {/* Expandable JSON Inspector */}
                {isExpanded && log && (
                  <div className="mt-3 space-y-2 pt-3 border-t border-slate-800 text-xs font-mono">
                    <div className="flex items-center justify-between text-slate-400 font-sans">
                      <span className="flex items-center space-x-1">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </span>
                      <span>ID: {log.id.substring(0, 12)}...</span>
                    </div>

                    {log.details && (
                      <div className="rounded-lg bg-slate-950 p-3 border border-slate-800/80 overflow-x-auto text-emerald-400">
                        <pre>{JSON.stringify(log.details, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800 text-xs text-slate-400">
        <span>Final Workflow Status</span>
        <span className="font-mono font-bold text-slate-200">{currentStatus}</span>
      </div>
    </div>
  );
};
