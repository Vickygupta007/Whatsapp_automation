export interface RioErpCustomer {
  id: string;
  name: string;
  phone: string;
  accountCode?: string;
  accountId?: string;
  contactPerson?: string;
  companyName?: string;
  labName?: string;
  email?: string;
  address?: string;
  isRegistered: boolean;
  status: string;
  customFields?: Record<string, unknown>;
}

export interface RioErpParty {
  id?: string;
  accountId: string;
  name: string;
  contactPerson?: string;
  mobileNumber?: string;
  companyId?: string;
  companyName?: string;
  labId?: string;
  labName?: string;
  partyType?: string;
  [key: string]: unknown;
}

export interface CustomerLookupResult {
  found: boolean;
  customer?: RioErpCustomer;
  party?: RioErpParty;
  rawResponse?: unknown;
}

export interface RioErpEyeRx {
  active?: boolean;
  sph?: number | string | null;
  cyl?: number | string | null;
  axis?: number | string | null;
  addn?: number | string | null;
  dia?: string | number | null;
  diameter?: string | number | null;
  qty?: number;
  [key: string]: unknown;
}

export interface RioErpRx {
  right?: RioErpEyeRx;
  left?: RioErpEyeRx;
  [key: string]: unknown;
}

export interface RioErpOrderRequest {
  phone: string;
  customerRefNo: string | null;
  brand?: string | null;
  brandName?: string | null;
  product: string | null;
  productName?: string | null;
  hasExplicitProduct?: boolean;
  lensBrand?: string | null;
  lensType: string | null;
  lensCategory?: string | null;
  category?: string | null;
  type?: string | null;
  coating: string | null;
  coatingName?: string | null;
  coatingType?: string | null;
  index: string | null;
  indexKey?: string | null;
  lensIndex?: string | null;
  dia?: string | null;
  diameter?: string | null;
  tint?: string | null;
  color?: string | null;
  colorName?: string | null;
  tintColor?: string | null;
  tinting?: string | null;
  tintingName?: string | null;
  colour?: string | null;
  fitting?: string | null;
  fittingType?: string | null;
  fit?: string | null;
  frameType?: string | null;
  remarks?: string | null;
  remark?: string | null;
  specialRemark?: string | null;
  specialRemarks?: string | null;
  notes?: string | null;
  note?: string | null;
  rawMessage: string;
  rx: RioErpRx;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface RioErpOrderResponse {
  success: boolean;
  orderId: string;
  orderRef?: string;
  status: string;
  message?: string;
  party?: RioErpParty;
  amount?: number;
  createdAt: string;
  rawResponse?: unknown;
}

export interface RioErpOrderStatusData {
  id?: string;
  orderId: string;
  customerRefNo?: string | null;
  customer?: string | null;
  orderDate?: string | null;
  status: string;
  pendingAt?: string | null;
  company?: string | null;
  labLocation?: string | null;
  product?: string | null;
  lensType?: string | null;
  coating?: string | null;
  index?: string | null;
  amount?: number | null;
  challanNo?: string | null;
  [key: string]: unknown;
}

export interface RioErpOrderStatusResponse {
  success: boolean;
  order?: RioErpOrderStatusData;
  message?: string;
  rawResponse?: unknown;
}

export interface RioErpOrdersListResponse {
  success: boolean;
  orders: RioErpOrderStatusData[];
  message?: string;
  rawResponse?: unknown;
}

export interface DeliveryTaskData {
  id: string;
  invoiceNo: string;
  customerName?: string;
  shopName?: string;
  deliveryAddress?: string;
  status: string;
  taskType?: string;
  deliveryBoyId?: string | null;
  proofPhotoPath?: string | null;
  [key: string]: unknown;
}

export interface IRioErpClient {
  findCustomerByPhone(phone: string): Promise<CustomerLookupResult>;
  createOrder(orderData: RioErpOrderRequest): Promise<RioErpOrderResponse>;
  getOrderStatus(orderId: string): Promise<RioErpOrderStatusResponse>;
  getOrdersByPhone?(phone: string): Promise<RioErpOrdersListResponse>;
  getDeliveryTasks?(): Promise<DeliveryTaskData[]>;
  getDeliveryTaskByOrderId?(orderId: string): Promise<DeliveryTaskData | null>;
}


