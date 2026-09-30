import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class TunnelService {
  private static childProcess: ChildProcess | null = null;
  private static publicUrl: string | null = null;
  private static isStarting = false;

  /**
   * Returns current active ngrok public URL if running
   */
  public static getPublicUrl(): string | null {
    return this.publicUrl;
  }

  /**
   * Starts ngrok tunnel automatically if enabled
   */
  public static async startTunnel(): Promise<string | null> {
    if (process.env.NODE_ENV === 'test') {
      return null;
    }

    if (!config.NGROK_ENABLED) {
      logger.info('[TunnelService] Ngrok auto-tunnel is disabled via NGROK_ENABLED=false');
      return null;
    }

    if (this.isStarting) {
      return this.publicUrl;
    }
    this.isStarting = true;

    try {
      // 1. Check if ngrok is already running (e.g. from an existing instance or background daemon)
      const existingUrl = await this.queryExistingTunnel();
      if (existingUrl) {
        this.publicUrl = existingUrl;
        logger.info(`[TunnelService] Active ngrok tunnel found: ${existingUrl}`);
        this.isStarting = false;
        return existingUrl;
      }

      // 2. Start ngrok process
      const port = config.PORT;
      const domain = config.NGROK_DOMAIN;
      const args = ['ngrok', 'http', String(port)];
      if (domain) {
        args.push(`--url=${domain}`);
      }

      logger.info(`[TunnelService] Starting ngrok tunnel (Port: ${port}, Domain: ${domain || 'auto'})...`);

      const proc = spawn('npx', args, {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      this.childProcess = proc;

      proc.stdout?.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          logger.debug(`[TunnelService][ngrok stdout] ${text}`);
        }
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString().trim();
        if (text && !text.includes('msg=')) {
          logger.debug(`[TunnelService][ngrok stderr] ${text}`);
        }
      });

      proc.on('error', (err) => {
        logger.error(`[TunnelService] Failed to start ngrok process: ${err.message}`);
      });

      proc.on('exit', (code, signal) => {
        logger.info(`[TunnelService] Ngrok process terminated (code: ${code}, signal: ${signal})`);
        this.childProcess = null;
        this.publicUrl = null;
      });

      // Register exit handlers to guarantee clean shutdown
      const cleanExit = () => {
        this.stopTunnel();
      };
      process.once('exit', cleanExit);
      process.once('SIGINT', cleanExit);
      process.once('SIGTERM', cleanExit);

      // 3. Poll ngrok internal API for tunnel URL
      const resolvedUrl = await this.pollTunnelUrl(20, 500);
      if (resolvedUrl) {
        this.publicUrl = resolvedUrl;
        logger.info(`[TunnelService] Ngrok tunnel established successfully: ${resolvedUrl}`);
        logger.info(`[TunnelService] Meta Webhook URL: ${resolvedUrl}/whatsapp-cloud-inbound`);
      } else {
        logger.warn('[TunnelService] Ngrok process started, but tunnel URL could not be resolved from API in time.');
      }

      this.isStarting = false;
      return this.publicUrl;
    } catch (err: unknown) {
      logger.error(`[TunnelService] Error starting ngrok tunnel: ${String(err)}`);
      this.isStarting = false;
      return null;
    }
  }

  /**
   * Queries local ngrok client web API (port 4040)
   */
  private static async queryExistingTunnel(): Promise<string | null> {
    try {
      const res = await axios.get('http://127.0.0.1:4040/api/tunnels', { timeout: 1500 });
      const tunnels = res.data?.tunnels as Array<{ public_url?: string; proto?: string }>;
      if (tunnels && tunnels.length > 0) {
        const httpsTunnel = tunnels.find((t) => t.proto === 'https') || tunnels[0];
        return httpsTunnel?.public_url || null;
      }
    } catch {
      // 4040 not responding means ngrok is not running
    }
    return null;
  }

  /**
   * Polls ngrok local API until tunnel is ready
   */
  private static async pollTunnelUrl(maxAttempts = 20, delayMs = 500): Promise<string | null> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const url = await this.queryExistingTunnel();
      if (url) {
        return url;
      }
    }
    return null;
  }

  /**
   * Stops the spawned ngrok tunnel process
   */
  public static stopTunnel(): void {
    if (this.childProcess) {
      logger.info('[TunnelService] Shutting down ngrok tunnel...');
      try {
        if (process.platform === 'win32' && this.childProcess.pid) {
          // On Windows, taskkill ensures all child subprocesses of npx are terminated
          spawn('taskkill', ['/pid', String(this.childProcess.pid), '/f', '/t'], { shell: true });
        } else {
          this.childProcess.kill('SIGTERM');
        }
      } catch (err) {
        logger.debug(`[TunnelService] Error killing ngrok process: ${String(err)}`);
      }
      this.childProcess = null;
      this.publicUrl = null;
    }
  }
}
