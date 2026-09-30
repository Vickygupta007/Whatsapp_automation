export type ProcessingStatus =
  | 'RECEIVED'
  | 'NORMALIZED'
  | 'CLASSIFIED'
  | 'REPLY_SELECTED'
  | 'REPLY_SENT'
  | 'REPLY_FAILED'
  | 'DUPLICATE_IGNORED'
  | 'CUSTOMER_LOOKUP'
  | 'CUSTOMER_NOT_FOUND'
  | 'ORDER_PARSING'
  | 'INVALID_ORDER'
  | 'ORDER_CREATING'
  | 'ORDER_CREATED'
  | 'CONFIRMATION_SENT'
  | 'FAILED';

export type PipelineStep =
  | 'WEBHOOK'
  | 'NORMALIZATION'
  | 'CLASSIFICATION'
  | 'REPLY_SELECTION'
  | 'WHATSAPP_REPLY'
  | 'CUSTOMER_LOOKUP'
  | 'ORDER_PARSER'
  | 'ORDER_CREATION'
  | 'CONFIRMATION';

export type StepStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface StepLogRecord {
  step: PipelineStep;
  status: StepStatus;
  timestamp: string;
  details?: Record<string, unknown>;
  errorType?: string;
  errorMessage?: string;
}

export interface WorkflowExecutionResult {
  messageId: string;
  phone: string;
  category?: string;
  replyText?: string;
  status: ProcessingStatus;
  customerId?: string;
  orderId?: string;
  erpOrderId?: string;
  logs: StepLogRecord[];
  error?: string;
}
