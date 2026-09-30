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
  | 'ORDER_VERIFICATION'
  | 'UNKNOWN';

export interface ClassificationResult {
  category: MessageCategory;
  replyText: string;
  reason: string;
  detectedKeywords?: string[];
  orderDetails?: Record<string, unknown>;
}

export const AUTO_REPLY_TEMPLATES: Record<MessageCategory, string> = {
  GREETING: `👋 Hello Customer Name,
Welcome to Rio Digital Lenses 👓
🏢 Account: Ash (100023)
🏭 Assigned Lab: RIO-AHMEDABAD
How can we help you today?

1.📝 ORDER FORMAT — Text ordering guide
2.📦 STATUS — Check order progress
3.❓ HELP — Support & assistance
📸 Send Prescription Photo — Place an order`,

  HELP: `ℹ️ *Rio Digital Lenses — Help*

Here are quick actions you can take:

📸 *Place Order*
Send a clear photo of your prescription slip.

📝 *Order by Text*
Reply *ORDER FORMAT* for the text order guide.

📦 *Track Order*
Send *STATUS <Order-ID>* (e.g. *STATUS SO-2026-00124*).`,

  ORDER_FORMAT: `📝 Order Format Guide

You can copy, edit and send this format:

Ref: 
Product: 
Type: 
Index: 
Coating: 
Dia: 
Color: 
Fit: 
R: -1.00 / -0.50 x 90
L: -1.25 / -0.25 x 180
Add: 
Remark: 

📸 Tip: It's even faster to just send a photo of the prescription slip!`,

  ORDER_STATUS: `📦 *Track Your Order*

To check live order progress, reply:

*STATUS <Order ID>*
Example: *STATUS SO-2026-581335720*`,

  VALID_ORDER: `✅ *Order Received!*

We received your lens order details and our lab technicians are reviewing it.

💬 Reply *STATUS* anytime for live updates.`,

  INVALID_ORDER: `⚠️ *Prescription Incomplete*

We could not read all required details.

👉 *Please provide:*
• Right (OD) & Left (OS) Eye Powers
• Lens Product & Coating
• Customer Reference (Ref)
• Dia, Tint/Color, Fitting Type, Remark (optional)

📸 Send a photo of the slip or type:
*R: -1.50 L: -2.00 Bluecut 1.56 Ref: Sharma*`,

  THANK_YOU: `😊 *You're Welcome!*

Thank you for choosing Rio Digital Lenses.
Let us know if you need anything else!`,

  UNREGISTERED_CUSTOMER: `⚠️ *Account Not Registered*

Your WhatsApp number is not linked to a Rio ERP account.

Please contact your Rio Digital Lenses lab coordinator to activate your account.`,

  CONFIRM_ORDER: `✅ Processing your order confirmation...`,

  EDIT_ORDER: `✏️ *Edit Prescription*

Please copy the message below, make your changes, and send it back:

Ref: Sharma
Product: I SIGHT
R: -1.50 / -0.50 x 90
L: -2.00 / -0.50 x 85
Dia: 70
Tint: Blue
Fitting: Full Rim
Type: Single Vision
Index: 1.56
Coating: Blue Cut
Remark: __

📸 Or simply send a clearer photo of the prescription slip!`,

  IMAGE_ORDER_VERIFICATION: `👓 *Verify Prescription Details*

Please check the scanned powers and tap Confirm or Edit below.`,

  ORDER_VERIFICATION: `👓 *Verify Order Details*

Please check the order details and tap Confirm or Edit below.`,

  UNKNOWN: `👋 *Welcome to Rio Digital Lenses*

We didn't quite catch that. Here is what you can do:

📸 *Send a Photo* of your prescription slip
📝 Reply *ORDER FORMAT* for ordering guide
📦 Reply *STATUS <Order-ID>* to track order
❓ Reply *HELP* for assistance`,
};
