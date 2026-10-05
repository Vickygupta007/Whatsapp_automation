export interface WhatsAppWebhookVerificationQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

export interface MetaMessageText {
  body: string;
}

export interface MetaMessageMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

export interface MetaIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'location' | 'contacts' | 'interactive' | string;
  text?: MetaMessageText;
  image?: MetaMessageMedia;
  document?: MetaMessageMedia;
  audio?: MetaMessageMedia;
  video?: MetaMessageMedia;
  interactive?: {
    type?: string;
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
  button?: {
    text: string;
    payload?: string;
  };
}

export interface MetaContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface MetaWebhookChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: MetaContact[];
  messages?: MetaIncomingMessage[];
  statuses?: unknown[];
}

export interface MetaWebhookChange {
  value: MetaWebhookChangeValue;
  field: string;
}

export interface MetaWebhookEntry {
  id: string;
  changes: MetaWebhookChange[];
}

export interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

export interface NormalizedMessage {
  phone: string;
  customerName: string | null;
  messageId: string;
  messageType: string;
  text: string | null;
  mediaId: string | null;
  storeId?: string | null;
  recipientPhoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
  rawPayload: Record<string, unknown>;
}
