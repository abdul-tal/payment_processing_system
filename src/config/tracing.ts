import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { logger } from './logger';

// Initialize tracing configuration
export function initializeTracing(): NodeSDK {
  const serviceName = process.env['SERVICE_NAME'] || 'payment-backend';
  const serviceVersion = process.env['SERVICE_VERSION'] || '1.0.0';
  const environment = process.env['NODE_ENV'] || 'development';

  // Configure resource attributes
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
  });

  // Configure Jaeger exporter
  const jaegerExporter = new JaegerExporter({
    endpoint:
      process.env['JAEGER_ENDPOINT'] || 'http://localhost:14268/api/traces',
  });

  // Initialize SDK
  const sdk = new NodeSDK({
    resource,
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
