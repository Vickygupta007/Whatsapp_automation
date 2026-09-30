# WhatsApp → Rio ERP Order Automation System

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-6.4-teal.svg)](https://www.prisma.io/)
[![Vitest](https://img.shields.io/badge/Vitest-3.0-yellow.svg)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg)](LICENSE)

> **Repository:** [branding-catalyst-pvt-ltd/whatsapp_automation](https://github.com/branding-catalyst-pvt-ltd/whatsapp_automation.git)

A high-performance, modular enterprise bridge and administrative management system that automates the end-to-end lifecycle of optical lens orders received via WhatsApp directly into **Rio ERP**. It replaces manual order punching with AI vision prescription parsing, deterministic optical prescription validation, interactive WhatsApp confirmation flows, and live order status tracking.

---

## 📌 Table of Contents
- [1. System Highlights](#1-system-highlights)
- [2. End-to-End Architecture & Workflow](#2-end-to-end-architecture--workflow)
- [3. Key Features](#3-key-features)
- [4. Technology Stack](#4-technology-stack)
- [5. Repository Structure](#5-repository-structure)
- [6. Prerequisites](#6-prerequisites)
- [7. Installation & Quickstart](#7-installation--quickstart)
- [8. Environment Variables (.env)](#8-environment-variables-env)
- [9. WhatsApp Customer Commands & Menu System](#9-whatsapp-customer-commands--menu-system)
- [10. Running Automated Tests](#10-running-automated-tests)
- [11. Meta WhatsApp Cloud API Setup](#11-meta-whatsapp-cloud-api-setup)
- [12. Rio ERP Live Integration](#12-rio-erp-live-integration)
- [13. Troubleshooting & Diagnostics](#13-troubleshooting--diagnostics)

---

## 1. System Highlights

- 📸 **Google Gemini Vision OCR**: Opticians can simply take a photo of handwritten or printed prescription slips. The system extracts Sphere (SPH), Cylinder (CYL), Axis, Addition (ADD), Lens Index, Coating, Type, Color, and Dia automatically.
- ⚡ **Deterministic Optical Parser**: High-accuracy rule-based regex parser capable of parsing natural, unstructured optical order formats (e.g. `R: -1.50/-0.50x90 L: -2.00 1.56 Blue Cut Ref: Sharma`).
- 🔘 **Interactive Verification & Edit Flow**: Dispatches interactive Meta WhatsApp buttons (`[ ✅ Confirm Order ]` / `[ ✏️ Edit Details ]`) so opticians can verify scanned numbers before order dispatch.
- 🚀 **Automated Rio ERP Dispatch**: Directly punches draft/confirmed sales orders into Rio ERP with optical specifications, party account mapping, and reference tracking.
- 🔍 **Live Order Status Tracking**: Customers can check live ERP status, lab processing stage, and dispatch details by sending `status`, `2`, or their `Order ID` (e.g., `SO-2026-278526704`).
- 🛡️ **Message Deduplication & Resilience**: Prevents duplicate ERP orders when Meta retries webhook events; automatically falls back to an in-memory repository if PostgreSQL is temporarily unavailable.
- 📊 **Real-time Admin Dashboard**: React + Vite monitoring dashboard with KPI metrics, full message audit trails, and a visual 6-stage execution inspector.

---

## 2. End-to-End Architecture & Workflow

```
Customer WhatsApp
       │
       ▼
Meta WhatsApp Cloud API Webhook
       │  (POST /whatsapp-cloud-inbound)
       ▼
[Stage 1: Webhook Received & Deduplication Check]
       │
       ▼
[Stage 2: Message Normalization (E.164 Phone, Text/Media Extraction)]
       │
       ▼
[Stage 3: Customer Registration Check (Rio ERP Party Lookup)]
       ├── Unregistered ──► Send Registration Assistance Message ──► STOP
       └── Registered
              │
              ▼
[Stage 4: Optical Order Parsing & Classification]
       ├── Prescription Image ──► Google Gemini Vision API OCR
       └── Text Order         ──► Rule-based Optical Parser
              │
              ▼
[Stage 5: Interactive Verification / Menu Routing]
       ├── Option 1 / "format" ──► Send Order Format Template Guide
       ├── Option 2 / "status" ──► Query & List Customer Orders from Rio ERP
       ├── Option 3 / "help"   ──► Send Support & Assistance Instructions
       ├── Order ID Query      ──► Query Live Order Status & Real Coating from Rio ERP
       └── New Order           ──► Send Interactive Verification Buttons:
                                    [ ✅ Confirm Order ] [ ✏️ Edit Details ]
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
                [Confirm Order]                          [Edit Details]
                        │                                     │
                        ▼                                     ▼
              Punch Order into Rio ERP               Send Editable Template
                        │                                     │
                        ▼                                     ▼
              Receive Rio Order ID                 Customer Resends Corrected
             (e.g., SO-2026-278526704)                     Details
                        │
                        ▼
            Send WhatsApp Confirmation
```

---

## 3. Key Features

### 1. Multi-Modal Prescription Intake
- **Image Prescriptions**: Downloads media from Meta Graph API using System User Access Tokens, and leverages Google Gemini Vision API to convert doctor prescription slips into structured optical JSON.
- **Text Prescriptions**: Extracts optical parameters even when formatted casually or shorthand (e.g., `OD`, `OS`, `RE`, `LE`, `SPH`, `CYL`, `AXIS`, `ADD`, `Dia`, `Tint`, `Fitting`).

### 2. Live Rio ERP Integration
- **Party Lookup**: Validates whether the sender's phone number belongs to an approved account in Rio ERP.
- **Order Placement**: Maps normalized optical data into Rio ERP's order schema (`/api/sales/orders`), preserving custom coatings (`BLUE CUT`, `HMC`, `SHMC`), lens indices (`1.50`, `1.56`, `1.60`, `1.67`, `1.74`), and customer reference numbers.
- **Accurate Coating Resolution**: Prevents ERP defaults from masking customer choices; preserves user-specified coatings (e.g. `BLUE CUT`) and omits coating tags when no coating was ordered.

### 3. Interactive Menu Navigation
- **Menu Option 1 (`1` or `order format`)**: Sends a copy-pasteable order format guide.
- **Menu Option 2 (`2` or `status`)**: Returns recent active orders with date and reference number, formatted to comply with Meta WhatsApp's 4,096 character limits.
- **Single Order Tracking**: When an optician sends their Order ID (e.g., `SO-2026-278526704`), the system returns live department progress (`Store Dept`, `Lab Processing`, etc.) and specifications.
- **Menu Option 3 (`3` or `help`)**: Delivers customer support options.

---

## 4. Technology Stack

### Backend
- **Runtime**: Node.js v18+ (tested on Node v22.14.0)
- **Framework**: Express.js with TypeScript
- **Validation**: Zod schema validation for environment and requests
- **Database**: PostgreSQL 16
- **ORM**: Prisma Client v6.4
- **Testing**: Vitest v3.0, Supertest
- **AI / OCR**: Google Gemini Vision API (`@google/genai`)

### Frontend (Admin Dashboard)
- **Framework**: React 18, Vite
- **Styling**: Tailwind CSS, Lucide React Icons
- **State & HTTP**: Axios, React Hooks

---

## 5. Repository Structure

```
whatsapp_automation/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma             # PostgreSQL schema (Messages, Orders, Logs, Webhooks)
│   ├── src/
│   │   ├── config/
│   │   │   └── env.ts                # Zod environment schema validation
│   │   ├── controllers/
│   │   │   ├── adminController.ts    # Dashboard metrics, orders, logs, simulator API
│   │   │   └── webhookController.ts  # Meta webhook verification & message ingestion
│   │   ├── database/
│   │   │   ├── db.ts                 # Prisma connection pool & health checks
│   │   │   └── repository.ts         # High-level data access & in-memory offline fallback
│   │   ├── integrations/
│   │   │   ├── rio-erp/              # Live & mock Rio ERP adapters, mappers, auth
│   │   │   └── whatsapp/             # Meta WhatsApp Cloud API client, button templates
│   │   ├── middleware/               # Error handling, request sanitization, access logs
│   │   ├── parsers/
│   │   │   ├── opticalPatterns.ts    # Indices, coatings, products, types, diopters
│   │   │   └── orderParser.ts        # Prescription text regex parser
│   │   ├── routes/
│   │   │   ├── adminRoutes.ts        # /api/admin/*
│   │   │   └── webhookRoutes.ts      # /whatsapp-cloud-inbound
│   │   ├── services/
│   │   │   ├── classifierService.ts  # Deterministic intent classifier
│   │   │   ├── imageOcrService.ts    # Google Gemini Vision optical prescription OCR
│   │   │   ├── normalizationService.ts # Meta payload to NormalizedMessage
│   │   │   ├── pendingOrderService.ts  # Verification & draft order state manager
│   │   │   ├── recentOrdersSessionService.ts # Session caching for order selection
│   │   │   ├── tunnelService.ts      # Automatic Ngrok public webhook tunnel
│   │   │   └── workflowService.ts    # Main 6-stage orchestration engine
│   │   ├── types/                    # Shared TypeScript interfaces
│   │   ├── app.ts                    # Express application configuration
│   │   └── server.ts                 # HTTP server entrypoint
│   └── tests/                        # Vitest automated test suites (50 unit/integration tests)
├── frontend/
│   ├── src/
│   │   ├── components/               # Navbar, Timeline, Simulator Modal, Rx Breakdown
│   │   ├── pages/                    # Dashboard, Messages Log, Orders Table
│   │   └── App.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docker-compose.yml                # PostgreSQL container
├── .env.example                      # Environment variables template
├── .gitignore                        # Git ignore patterns
└── README.md                         # Project documentation
```

---

## 6. Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **PostgreSQL**: Local PostgreSQL 15+ installation or Docker
- **Meta WhatsApp Cloud API**: WhatsApp Business Account (WABA), Phone Number ID, and Permanent Access Token
- **Google Gemini API Key**: For optical prescription slip image OCR (Optional if only text orders are used)

---

## 7. Installation & Quickstart

### Step 1: Clone the Repository
```bash
git clone https://github.com/branding-catalyst-pvt-ltd/whatsapp_automation.git
cd whatsapp_automation
```

### Step 2: Configure Environment Variables
Copy `.env.example` to `backend/.env`:
```bash
# Windows PowerShell:
Copy-Item .env.example backend/.env

# Linux / macOS:
cp .env.example backend/.env
```
Edit `backend/.env` with your Meta API credentials, Rio ERP URL, and PostgreSQL connection string.

### Step 3: Install Dependencies
```bash
# Install backend dependencies
cd backend
npm install
npm run prisma:generate

# Install frontend dependencies
cd ../frontend
npm install
```

### Step 4: Run Database Migrations
If using a real PostgreSQL instance:
```bash
cd backend
npm run prisma:push
```
*(Note: If PostgreSQL is not running, the system will automatically utilize its built-in in-memory repository store so development and testing proceed without interruption).*

### Step 5: Start the Development Servers
From the project root directory, run both frontend and backend concurrently:
```bash
npm run dev
```

Or start them in separate terminals:

**Backend:**
```bash
cd backend
npm run dev
# Server running at http://localhost:3000
```

**Frontend:**
```bash
cd frontend
npm run dev
# UI accessible at http://localhost:5173
```

---

## 8. Environment Variables (.env)

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Backend HTTP listening port | `3000` |
| `NODE_ENV` | Environment (`development` / `production`) | `development` |
| `DATABASE_URL` | PostgreSQL connection URI | `postgresql://postgres:postgres@localhost:5432/postgres?schema=public` |
| `RIO_ERP_BASE_URL` | Live Rio ERP API endpoint | `http://200.234.35.179:3000` |
| `RIO_ERP_API_KEY` | Rio ERP integration secret key | `rio_whatsapp_secret_key_2026` |
| `RIO_ERP_AUTH_TYPE` | Auth method (`api-key` / `bearer` / `basic`) | `api-key` |
| `RIO_ERP_USE_MOCK` | Set `true` to simulate Rio ERP offline | `false` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Phone Number ID | `1327525300446181` |
| `WHATSAPP_ACCESS_TOKEN` | Meta System User Graph API Token | `EAA...` |
| `WHATSAPP_VERIFY_TOKEN` | Custom token to verify webhook with Meta | `rio_erp_verify_2026` |
| `WHATSAPP_USE_MOCK` | Set `true` to log WhatsApp replies to console | `false` |
| `GEMINI_API_KEY` | Google Gemini API Key for slip OCR | `AQ.Ab8...` |
| `NGROK_ENABLED` | Automatically launch Ngrok tunnel on boot | `true` |
| `NGROK_DOMAIN` | Static Ngrok reservation domain (optional) | `your-subdomain.ngrok-free.dev` |

---

## 9. WhatsApp Customer Commands & Menu System

Customers chatting with the WhatsApp bot can use the following interactive triggers:

### 1. View Order Format Guide
Send `1`, `format`, or `order format`:
```
📝 Order Format Guide

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

📸 Tip: It's even faster to just send a photo of the prescription slip!
```

### 2. View Recent Orders List
Send `2`, `status`, `orders`, or `track`:
```
📦 *Your Recent Orders* (Total: 4)

Select an order below to check live status:

1. *SO-2026-278526704* — xyz (09-30)
2. *SO-2026-496746276* — Sharma (09-29)
3. *SO-2026-968186571* — Patient (09-29)
4. *SO-2026-306013678* — Amin Optics (09-29)

👉 *How to check status:*
• Send the *Order ID* (e.g. *SO-2026-278526704*)
• Reply *1* for Order Format Guide, or *3* for Help!
```

### 3. Track Specific Order Details
Send any Order ID (e.g. `SO-2026-278526704`):
```
🔍 *ORDER STATUS*

📦 Order: *SO-2026-278526704*
⚡ Status: *Draft*
🔬 Stage: *Store Dept*

📋 *Details:*
• Ref: *xyz*
• Product: *I SIGHT* (Single Vision) (BLUE CUT)
• Lab: *RIO-AHMEDABAD*
• Account: *amk*
• Date: *2026-09-30 06:00*

🏭 Our lab is actively processing your order.

💬 Reply *STATUS* anytime to see all your orders!
```

### 4. Help & Support
Send `3`, `help`, or `support` to receive direct lab contact details and assistance.

---

## 10. Running Automated Tests

The backend includes a comprehensive Vitest automated test suite with 50 tests covering parsers, validators, webhooks, deduplication, and workflows.

Run all tests:
```bash
cd backend
npm test
```

Watch mode for continuous development:
```bash
npm run test:watch
```

Test coverage report:
```bash
npm run test:coverage
```

---

## 11. Meta WhatsApp Cloud API Setup

1. Log in to the [Meta for Developers Console](https://developers.facebook.com/).
2. Select your App and navigate to **WhatsApp** → **Configuration**.
3. In the **Webhook** section:
   - **Callback URL**: Enter your public HTTPS URL (e.g., `https://your-domain.ngrok-free.dev/whatsapp-cloud-inbound`).
   - **Verify Token**: Enter the same token specified in `WHATSAPP_VERIFY_TOKEN` in your `backend/.env`.
   - Click **Verify and Save**.
4. In **Webhook fields**, click **Manage** and subscribe to `messages`.
5. Under **API Setup**, retrieve your **Phone Number ID** and generate a permanent **System User Access Token** with `whatsapp_business_messaging` permissions.

---

## 12. Rio ERP Live Integration

The bridge integrates directly with Rio ERP REST endpoints:
- `POST /api/integrations/whatsapp/lookup`: Verifies customer registration by phone number.
- `POST /api/sales/orders`: Creates new optical work orders with full prescription, coating, index, color, dia, and fitting details.
- `GET /api/integrations/whatsapp/order-status?orderId={id}`: Queries live order status, department stage, and challan details.
- `GET /api/integrations/whatsapp/orders?phone={phone}`: Lists all active and historical orders belonging to the customer's account.

---

## 13. Troubleshooting & Diagnostics

- **Meta Webhook Verification Fails (HTTP 403)**:
  Ensure `hub.verify_token` sent by Meta matches `WHATSAPP_VERIFY_TOKEN` in `backend/.env`.
- **Duplicate Orders on WhatsApp**:
  The system automatically hashes and stores every Meta `messageId`. Any duplicate webhook received from Meta within 24 hours is acknowledged with HTTP 200 and ignored.
- **Port Conflicts**:
  If port 3000 is occupied, adjust `PORT=3001` in `backend/.env` and update `CORS_ORIGIN` in the backend and frontend configurations.
- **PostgreSQL Offline**:
  The application automatically falls back to an in-memory repository if PostgreSQL is not reachable, ensuring zero-downtime operation.

---

## 📄 License
This project is proprietary and maintained by [Branding Catalyst Pvt Ltd](https://github.com/branding-catalyst-pvt-ltd).
