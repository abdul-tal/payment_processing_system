import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { logger } from './logger';

// Simple tracing configuration that works
export function initializeSimpleTracing(): void {
  try {
    logger.info('Starting simplified OpenTelemetry tracing...');
    
    const serviceName = process.env['SERVICE_NAME'] || 'payment-backend';
    const jaegerEndpoint = process.env['JAEGER_ENDPOINT'] || 'http://localhost:14268/api/traces';
    
    const jaegerExporter = new JaegerExporter({
      endpoint: jaegerEndpoint,
    });

    const sdk = new NodeSDK({
      serviceName,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-http': { enabled: true },
          '@opentelemetry/instrumentation-express': { enabled: true },
          '@opentelemetry/instrumentation-redis': { enabled: true },
          '@opentelemetry/instrumentation-pg': { enabled: true },
        }),
      ],
      traceExporter: jaegerExporter,
    });

    sdk.start();
    logger.info('Simplified tracing initialized successfully', {
      serviceName,
      jaegerEndpoint
    });
  } catch (error) {
    logger.error('Failed to initialize simplified tracing:', error);
  }
}

// Auto-start tracing when module is imported
logger.info('Loading simplified tracing configuration...');
initializeSimpleTracing();
