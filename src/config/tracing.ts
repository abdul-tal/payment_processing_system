import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { logger } from './logger';

// Initialize tracing configuration
export function initializeTracing(): NodeSDK {
  // Configure Jaeger exporter
  const jaegerExporter = new JaegerExporter({
    endpoint:
      process.env['JAEGER_ENDPOINT'] || 'http://localhost:14268/api/traces',
  });

  // Initialize SDK
  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          ignoreIncomingRequestHook: req => {
            const url = req.url || '';
            return url.includes('/health') || url.includes('/metrics');
          },
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-redis': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
      }),
    ],
    traceExporter: jaegerExporter,
  });

  return sdk;
}

// Start tracing
export function startTracing(): void {
  try {
    logger.info('Starting OpenTelemetry tracing initialization...');
    const sdk = initializeTracing();
    sdk.start();
    logger.info('Tracing initialized successfully', {
      serviceName: process.env['SERVICE_NAME'] || 'payment-backend',
      jaegerEndpoint:
        process.env['JAEGER_ENDPOINT'] || 'http://localhost:14268/api/traces',
    });
  } catch (error) {
    logger.error('Failed to initialize tracing:', error);
  }
}

// Auto-start tracing when module is imported
logger.info('Loading tracing configuration module...');
startTracing();
