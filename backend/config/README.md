# 🌐 Multi-Website & Multi-WhatsApp Configuration Guide

This project allows you to connect **unlimited optical websites** and **unlimited WhatsApp numbers** from a single configuration file:
👉 [`backend/config/stores.json`](./stores.json)

---

## 📌 How It Works

1. **Default Website (Rio Optical)**:
   - Always active from your `.env` file. You don't need to do anything for Rio.
2. **Additional Websites (Friend / Future Stores)**:
   - Added directly to `stores.json`.
   - Each website gets its own WhatsApp Number ID and its own ERP API details.
   - When a customer messages that WhatsApp number, the system automatically routes to that website's ERP!

---

## 🚀 How to Add a New Website (3 Steps)

### Step 1: Open `backend/config/stores.json`
Open the file: `backend/config/stores.json`.

### Step 2: Copy & Paste a New Store Block
Simply add a new block inside the `[ ... ]` array:

```json
[
  {
    "id": "store_1",
    "name": "Friend Optical Store",
    "whatsappPhoneNumberId": "104928374829102",
    "whatsappDisplayPhone": "+919876543210",
    "whatsappAccessToken": "EAA...",
    "erp": {
      "type": "rio-erp",
      "baseUrl": "https://api.friendwebsite.com",
      "apiKey": "friend_secret_api_key",
      "authType": "api-key",
      "useMock": false
    }
  },
  {
    "id": "store_2",
    "name": "Future Store Name",
    "whatsappPhoneNumberId": "205938475839201",
    "whatsappDisplayPhone": "+919811122233",
    "whatsappAccessToken": "EAA...",
    "erp": {
      "type": "rio-erp",
      "baseUrl": "https://api.futurewebsite.com",
      "apiKey": "future_secret_api_key",
      "authType": "api-key",
      "useMock": false
    }
  }
]
```

### Step 3: Set Webhook in Meta for the New WhatsApp Number
In the Meta Developer Console for that WhatsApp number:
- **Callback URL**: `https://<your-server-domain>/whatsapp-cloud-inbound`
- **Verify Token**: `rio_erp_verify_2026`
- **Webhook Subscriptions**: Check `messages`.

---

## 📋 Field Explanation Reference

| Field | Description | Example |
| :--- | :--- | :--- |
| `id` | Unique internal identifier for the store | `"site2_friend"` |
| `name` | Store name shown to customer on WhatsApp | `"Vision Craft Opticals"` |
| `whatsappPhoneNumberId` | Meta's 15-16 digit Phone Number ID | `"104928374829102"` |
| `whatsappDisplayPhone` | Visible phone number | `"+919876543210"` |
| `whatsappAccessToken` | Permanent Meta Token (leave blank if on same Meta App) | `"EAAG..."` |
| `erp.type` | ERP type (`rio-erp` or `mock`) | `"rio-erp"` |
| `erp.baseUrl` | Website API URL where orders are punched | `"https://api.friendwebsite.com"` |
| `erp.apiKey` | Secret API authentication key | `"secret_token_xxx"` |
| `erp.authType` | Auth method (`api-key`, `bearer`, or `basic`) | `"api-key"` |
| `erp.useMock` | Set `false` for live orders, `true` for testing | `false` |
