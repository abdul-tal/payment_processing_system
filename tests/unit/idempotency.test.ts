import { Response, NextFunction } from 'express';
import {
  idempotencyMiddleware,
  IdempotentRequest,
  getIdempotencyCacheStats,
  clearCleanupInterval,
} from '../../src/middleware/idempotency';

describe('Idempotency Middleware', () => {
  let mockRequest: Partial<IdempotentRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  afterAll(() => {
    // Clear the cleanup interval to prevent Jest from hanging
    clearCleanupInterval();
  });

  beforeEach(() => {
    responseJson = jest.fn().mockReturnThis();
    responseStatus = jest.fn().mockReturnThis();
    mockNext = jest.fn();

    mockRequest = {
      method: 'POST',
      headers: {},
      body: {},
      correlationId: 'test-correlation-id',
    };

    mockResponse = {
      json: responseJson,
      status: responseStatus,
      statusCode: 200,
    };

    jest.clearAllMocks();
  });

  describe('Non-POST requests', () => {
    it('should skip idempotency for GET requests', () => {
      mockRequest.method = 'GET';

      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRequest.idempotencyKey).toBeUndefined();
    });

    it('should skip idempotency for PUT requests', () => {
      mockRequest.method = 'PUT';

      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRequest.idempotencyKey).toBeUndefined();
    });
  });

  describe('POST requests without idempotency key', () => {
    it('should continue without idempotency key when not provided', () => {
      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockRequest.idempotencyKey).toBeUndefined();
    });
  });

  describe('POST requests with idempotency key', () => {
    const validIdempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

    it('should accept valid idempotency key from header', () => {
      mockRequest.headers!['idempotency-key'] = validIdempotencyKey;

      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.idempotencyKey).toBe(validIdempotencyKey);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should accept valid idempotency key from body', () => {
      mockRequest.body!.idempotencyKey = validIdempotencyKey;

      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.idempotencyKey).toBe(validIdempotencyKey);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should prefer header over body for idempotency key', () => {
      const headerKey = '550e8400-e29b-41d4-a716-446655440001';
      const bodyKey = '550e8400-e29b-41d4-a716-446655440002';

      mockRequest.headers!['idempotency-key'] = headerKey;
      mockRequest.body!.idempotencyKey = bodyKey;

      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.idempotencyKey).toBe(headerKey);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid idempotency key format - too short', () => {
      mockRequest.headers!['idempotency-key'] = 'short';

      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid idempotency key format',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid idempotency key format - too long', () => {
      const longKey = 'a'.repeat(51);
      mockRequest.headers!['idempotency-key'] = longKey;

      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid idempotency key format',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid idempotency key format - invalid characters', () => {
      mockRequest.headers!['idempotency-key'] = 'invalid key with spaces!';

      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid idempotency key format',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Response caching', () => {
    const idempotencyKey = '550e8400-e29b-41d4-a716-446655440003';

    beforeEach(() => {
      mockRequest.headers!['idempotency-key'] = idempotencyKey;
      // Clear the idempotency cache before each test
      const { idempotencyStore } = require('../../src/middleware/idempotency');
      if (idempotencyStore && idempotencyStore.clear) {
        idempotencyStore.clear();
      }
    });

    it('should cache successful responses', () => {
      // First request
      idempotencyMiddleware(
        mockRequest as IdempotentRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledTimes(1);

      // Simulate successful response
      mockResponse.statusCode = 201;
      const responseData = { id: 'txn_123', status: 'completed' };

      // Call the overridden json method
      (mockResponse as any).json(responseData);

      // Second request with same idempotency key
      const mockRequest2 = { ...mockRequest };
      const mockResponse2 = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        statusCode: 201,
      };
      const mockNext2 = jest.fn();

      idempotencyMiddleware(
        mockRequest2 as unknown as IdempotentRequest,
        mockResponse2 as unknown as Response,
        mockNext2
      );

      // Should return cached response without calling next
      expect(mockNext2).not.toHaveBeenCalled();
      expect(mockResponse2.status).toHaveBeenCalledWith(201);
      expect(mockResponse2.json).toHaveBeenCalledWith(responseData);
    });

    it('should not cache error responses', () => {
      // Use a unique idempotency key for this test
      const errorTestKey = '550e8400-e29b-41d4-a716-446655440004';
      const mockErrorRequest = {
        method: 'POST',
        headers: { 'idempotency-key': errorTestKey },
        correlationId: 'test-correlation-id',
      };
      const mockErrorResponse = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        statusCode: 400,
      };
      const mockErrorNext = jest.fn();

      // First request
      idempotencyMiddleware(
        mockErrorRequest as unknown as IdempotentRequest,
        mockErrorResponse as unknown as Response,
        mockErrorNext
      );

      expect(mockErrorNext).toHaveBeenCalledTimes(1);

      // Simulate error response (400 status code)
      const errorData = { error: 'Payment failed' };

      // Call the overridden json method to simulate error response
      (mockErrorResponse as any).json(errorData);

      // Second request with same idempotency key should not find cached response
      const mockRequest2 = {
        method: 'POST',
        headers: { 'idempotency-key': errorTestKey },
        correlationId: 'test-correlation-id',
      };
      const mockResponse2 = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        statusCode: 200,
      };
      const mockNext2 = jest.fn();

      idempotencyMiddleware(
        mockRequest2 as unknown as IdempotentRequest,
        mockResponse2 as unknown as Response,
        mockNext2
      );

      // Should call next since error responses are not cached
      expect(mockNext2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache statistics', () => {
    it('should provide cache statistics', () => {
      const stats = getIdempotencyCacheStats();

      expect(stats).toHaveProperty('totalKeys');
      expect(stats).toHaveProperty('oldestEntry');
      expect(stats).toHaveProperty('newestEntry');
      expect(typeof stats.totalKeys).toBe('number');
    });
  });
});
