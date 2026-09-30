import { config } from '../../config/env.js';

export interface ConfirmationParams {
  orderId: string;
  accountName: string;
  product: string;
  customerRef: string;
}

export class WhatsAppTemplates {
  public static getUnregisteredMessage(): string {
    return config.MSG_UNREGISTERED_CUSTOMER;
  }

  public static getInvalidOrderHelpMessage(): string {
    return config.MSG_INVALID_ORDER_HELP;
  }

  public static getOrderConfirmationMessage(params: ConfirmationParams): string {
    let tpl = config.MSG_ORDER_CONFIRMATION_TEMPLATE;
    tpl = tpl.replace('{orderId}', params.orderId);
    tpl = tpl.replace('{accountName}', params.accountName || 'Optical Customer');
    tpl = tpl.replace('{product}', params.product || 'Optical Lens');
    tpl = tpl.replace('{customerRef}', params.customerRef || 'N/A');
    return tpl;
  }
}
