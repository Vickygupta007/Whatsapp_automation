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

export type MessageCategory =
  | 'GREETING'
  | 'HELP'
  | 'ORDER_FORMAT'
  | 'ORDER_STATUS'
  | 'VALID_ORDER'
  | 'INVALID_ORDER'
  | 'THANK_YOU'
  | 'UNREGISTERED_CUSTOMER'
  | 'CONFIRM_ORDER'
  | 'EDIT_ORDER'
  | 'IMAGE_ORDER_VERIFICATION'
  | 'UNKNOWN';

export interface AdminMetrics {
  totalMessagesReceived: number;
  totalRepliesSent: number;
  successfulReplies: number;
  failedReplies: number;
  duplicateMessagesIgnored: number;
  totalMessages?: number;
  ordersCreated?: number;
  invalidOrders?: number;
  unregisteredCustomers?: number;
  failedExecutions?: number;
}

export interface StoredMessage {
  id: string;
  messageId: string;
  phone: string;
  customerName: string | null;
  messageType: string;
  textContent: string | null;
  mediaId: string | null;
  category?: string | null;
  replyText?: string | null;
  replyStatus?: string | null;
  status: ProcessingStatus;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StoredOrder {
  id: string;
  messageId: string;
  erpOrderId: string | null;
  erpOrderRef: string | null;
  phone: string;
  customerRefNo: string | null;
  product: string | null;
  lensType: string | null;
  coating: string | null;
  index: string | null;
  rxData: {
    right?: { sph: string | null; cyl: string | null; axis: string | null };
    left?: { sph: string | null; cyl: string | null; axis: string | null };
  } | null;
  rawMessage: string;
  status: ProcessingStatus;
  erpRequestPayload: Record<string, unknown> | null;
  erpResponsePayload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingLog {
  id: string;
  messageId: string;
  orderId: string | null;
  step: PipelineStep;
  status: StepStatus;
  details: Record<string, unknown> | null;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface MessageDetailsResponse {
  message: StoredMessage;
  order: StoredOrder | null;
  logs: ProcessingLog[];
}

export interface SimulationResult {
  result: {
    messageId: string;
    phone: string;
    category?: string;
    replyText?: string;
    status: ProcessingStatus;
    customerId?: string;
    orderId?: string;
    erpOrderId?: string;
    error?: string;
  };
  details: MessageDetailsResponse;
}
