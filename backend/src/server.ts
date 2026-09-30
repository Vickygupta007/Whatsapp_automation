// Auto-managed backend with embedded ngrok tunnel lifecycle
import { app } from './app.js';
import { config } from './config/env.js';
import { getPrismaClient } from './database/db.js';
import { logger } from './utils/logger.js';
import { TunnelService } from './services/tunnelService.js';

async function bootstrap() {
  // Attempt DB connection
  await getPrismaClient();

  const server = app.listen(config.PORT, async () => {
    // Automatically start or attach to ngrok tunnel
    const tunnelUrl = await TunnelService.startTunnel();

    logger.info(`====================================================`);
    logger.info(` WhatsApp Auto-Reply System Server Active`);
    logger.info(` Local Port:        http://localhost:${config.PORT}`);
    if (tunnelUrl) {
      logger.info(` Ngrok Public URL:  ${tunnelUrl}`);
      logger.info(` Webhook Endpoint:  ${tunnelUrl}/whatsapp-cloud-inbound`);
    } else {
      logger.info(` Webhook Endpoint:  http://localhost:${config.PORT}/whatsapp-cloud-inbound`);
    }
    logger.info(` Admin API:         http://localhost:${config.PORT}/api/admin`);
    logger.info(` Healthcheck:       http://localhost:${config.PORT}/health`);
    logger.info(` Environment:       ${config.NODE_ENV}`);
    logger.info(` Rio ERP Mode:      ${config.RIO_ERP_USE_MOCK ? 'Mock / Sandbox' : 'Live Client (' + config.RIO_ERP_BASE_URL + ')'}`);
    logger.info(` WhatsApp API Mode: ${config.WHATSAPP_USE_MOCK ? 'Mock' : 'Live Graph API'}`);
    logger.info(` Gemini Vision AI:  ${config.GEMINI_API_KEY ? 'Active (Key loaded)' : 'Inactive (Missing Key)'}`);
    logger.info(`====================================================`);
  });

  const shutdown = async () => {
    logger.info('Shutting down server gracefully...');
    TunnelService.stopTunnel();
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}


bootstrap().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
