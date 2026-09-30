import cors from 'cors';
import express, { Application, Request, Response } from 'express';
import { config } from './config/env.js';
import { isConnectedToDatabase } from './database/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import adminRoutes from './routes/adminRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { TunnelService } from './services/tunnelService.js';

export function createApp(): Application {
  const app = express();

  // Basic security and parsing
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Root endpoint: friendly landing page explaining the backend service with direct link to frontend dashboard
  app.get('/', (req: Request, res: Response) => {
    if (req.accepts('html')) {
      res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rio ERP WhatsApp Automation - Backend Active</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    body { background: #020617; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; max-width: 600px; width: 100%; padding: 36px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); color: #34d399; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
    .pulse { width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 10px #34d399; }
    h1 { font-size: 24px; font-weight: 800; margin-bottom: 8px; color: #ffffff; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 12px 20px; border-radius: 10px; background: linear-gradient(135deg, #059669, #0d9488); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; transition: all 0.2s; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3); }
    .btn:hover { background: linear-gradient(135deg, #10b981, #14b8a6); transform: translateY(-1px); }
    .endpoints { margin-top: 28px; border-top: 1px solid #1e293b; padding-top: 20px; }
    .endpoints h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 12px; }
    .endpoint-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #020617; border-radius: 8px; margin-bottom: 8px; font-family: monospace; font-size: 12px; }
    .endpoint-item a { color: #38bdf8; text-decoration: none; }
    .endpoint-item a:hover { text-decoration: underline; }
    .method { color: #34d399; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">
      <div class="pulse"></div>
      Backend API Server Online (Port 3000)
    </div>
    <h1>Rio ERP WhatsApp Order Automation</h1>
    <p>The backend webhook engine and API services are running normally. To view the admin monitoring dashboard, inspect execution flows, or run the live message simulator, click the button below:</p>
    
    <a href="http://localhost:5173" class="btn" target="_blank">
      Open Admin Dashboard (localhost:5173) &rarr;
    </a>

    <div class="endpoints">
      <h3>Active Backend Endpoints</h3>
      <div class="endpoint-item">
        <span class="method">GET/POST</span>
        <a href="/whatsapp-cloud-inbound">/whatsapp-cloud-inbound</a>
        <span style="color: #94a3b8">Meta Webhook</span>
      </div>
      <div class="endpoint-item">
        <span class="method">GET</span>
        <a href="/health">/health</a>
        <span style="color: #94a3b8">Health Check</span>
      </div>
      <div class="endpoint-item">
        <span class="method">GET</span>
        <a href="/api/admin/metrics">/api/admin/metrics</a>
        <span style="color: #94a3b8">KPI Stats</span>
      </div>
      <div class="endpoint-item">
        <span class="method">GET</span>
        <a href="/api/admin/messages">/api/admin/messages</a>
        <span style="color: #94a3b8">Messages</span>
      </div>
      <div class="endpoint-item">
        <span class="method">GET</span>
        <a href="/api/admin/orders">/api/admin/orders</a>
        <span style="color: #94a3b8">Orders</span>
      </div>
    </div>
  </div>
</body>
</html>
      `);
      return;
    }

    res.json({
      service: 'whatsapp-rio-erp-automation',
      status: 'active',
      port: config.PORT,
      frontendUrl: 'http://localhost:5173',
      endpoints: {
        webhook: '/whatsapp-cloud-inbound',
        health: '/health',
        metrics: '/api/admin/metrics',
        messages: '/api/admin/messages',
        orders: '/api/admin/orders',
      },
    });
  });

  // Healthcheck endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'whatsapp-rio-erp-automation',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      databaseConnected: isConnectedToDatabase(),
      rioErpMock: config.RIO_ERP_USE_MOCK,
      whatsappMock: config.WHATSAPP_USE_MOCK,
      tunnelUrl: TunnelService.getPublicUrl(),
    });
  });

  // Meta Webhook routes at root (GET/POST /whatsapp-cloud-inbound)
  app.use('/', webhookRoutes);

  // Admin and execution visualizer routes
  app.use('/api/admin', adminRoutes);

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
