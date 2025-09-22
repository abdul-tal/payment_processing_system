import validator from 'validator';
import DOMPurify from 'isomorphic-dompurify';
import { logger } from '../config/logger';

export interface SanitizationOptions {
  allowHtml?: boolean;
  maxLength?: number;
  trimWhitespace?: boolean;
  normalizeEmail?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  sanitizedValue: string;
  errors: string[];
}

export class InputSanitizer {
  private static instance: InputSanitizer;

  private constructor() {}

  public static getInstance(): InputSanitizer {
    if (!InputSanitizer.instance) {
      InputSanitizer.instance = new InputSanitizer();
    }
    return InputSanitizer.instance;
  }

  /**
   * Sanitizes general text input
   */
  public sanitizeText(
    input: string,
    options: SanitizationOptions = {}
  ): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue = input;

    try {
      // Check if input is string
      if (typeof input !== 'string') {
        return {
          isValid: false,
          sanitizedValue: '',
          errors: ['Input must be a string'],
        };
      }

      // Trim whitespace if requested
      if (options.trimWhitespace !== false) {
        sanitizedValue = sanitizedValue.trim();
      }

      // Check for XSS patterns before sanitization
      const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<iframe\b/gi,
        /<object\b/gi,
        /<embed\b/gi,
        /<link\b/gi,
        /<meta\b/gi,
      ];

      let hasXssContent = false;
      for (const pattern of xssPatterns) {
        if (pattern.test(input)) {
          hasXssContent = true;
          break;
        }
      }

      // Check maximum length
      if (options.maxLength && sanitizedValue.length > options.maxLength) {
        errors.push(
          `Input exceeds maximum length of ${options.maxLength} characters`
        );
        sanitizedValue = sanitizedValue.substring(0, options.maxLength);
      }

      // Remove or escape HTML
      if (options.allowHtml) {
        sanitizedValue = DOMPurify.sanitize(sanitizedValue);
      } else {
        // For XSS patterns, remove them completely instead of escaping
        if (hasXssContent) {
          sanitizedValue = sanitizedValue.replace(
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            ''
          );
          sanitizedValue = sanitizedValue.replace(/javascript:/gi, '');
          sanitizedValue = sanitizedValue.replace(/on\w+\s*=/gi, '');
          // Don't add error after successful sanitization
        } else {
          sanitizedValue = validator.escape(sanitizedValue);
        }
      }

      // Remove null bytes and control characters
      // eslint-disable-next-line no-control-regex
      sanitizedValue = sanitizedValue.replace(
        // eslint-disable-next-line no-control-regex
        /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,
        ''
      );

      return {
        isValid: errors.length === 0,
        sanitizedValue,
        errors,
      };
    } catch (error) {
      logger.error('Text sanitization failed', {
        error: error instanceof Error ? error.message : String(error),
        input: input.substring(0, 100),
      });
      return {
        isValid: false,
        sanitizedValue: '',
        errors: ['Sanitization failed'],
      };
    }
  }

  /**
   * Sanitizes and validates email addresses
   */
  public sanitizeEmail(email: string): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue = email;

    try {
      if (typeof email !== 'string') {
        return {
          isValid: false,
          sanitizedValue: '',
          errors: ['Email must be a string'],
        };
      }

      // Trim and normalize
      sanitizedValue = sanitizedValue.trim().toLowerCase();

      // Validate email format
      if (!validator.isEmail(sanitizedValue)) {
        errors.push('Invalid email format');
      }

      // Additional security checks
      if (sanitizedValue.includes('..')) {
        errors.push('Email contains consecutive dots');
      }

      if (sanitizedValue.length > 254) {
        errors.push('Email exceeds maximum length of 254 characters');
      }

      // Remove any potential XSS attempts
      sanitizedValue = validator.escape(sanitizedValue);

      return {
        isValid: errors.length === 0,
        sanitizedValue,
        errors,
      };
    } catch (error) {
      logger.error('Email sanitization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isValid: false,
        sanitizedValue: '',
        errors: ['Email sanitization failed'],
      };
    }
  }

  /**
   * Sanitizes phone numbers
   */
  public sanitizePhoneNumber(phone: string): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue = phone;

    try {
      if (typeof phone !== 'string') {
        return {
          isValid: false,
          sanitizedValue: '',
          errors: ['Phone number must be a string'],
        };
      }

      // Remove all non-digit characters except + at the beginning
      sanitizedValue = sanitizedValue.replace(/[^\d+]/g, '');

      // Ensure + is only at the beginning
      if (sanitizedValue.includes('+')) {
        const parts = sanitizedValue.split('+');
        if (parts.length > 2 || parts[0] !== '') {
          errors.push('Invalid phone number format');
        } else {
          sanitizedValue = '+' + parts[1];
        }
      }

      // Validate length (international format: 7-15 digits)
      const digits = sanitizedValue.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        errors.push('Phone number must be between 7 and 15 digits');
      }

      return {
        isValid: errors.length === 0,
        sanitizedValue,
        errors,
      };
    } catch (error) {
      logger.error('Phone sanitization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isValid: false,
        sanitizedValue: '',
        errors: ['Phone sanitization failed'],
      };
    }
  }

  /**
   * Sanitizes credit card numbers
   */
  public sanitizeCreditCardNumber(cardNumber: string): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue = cardNumber;

    try {
      if (typeof cardNumber !== 'string') {
        return {
          isValid: false,
          sanitizedValue: '',
          errors: ['Card number must be a string'],
        };
      }

      // Remove all non-digit characters
      sanitizedValue = sanitizedValue.replace(/\D/g, '');

      // Validate length (13-19 digits for most card types)
      if (sanitizedValue.length < 13 || sanitizedValue.length > 19) {
        errors.push('Card number must be between 13 and 19 digits');
      }

      // Basic Luhn algorithm validation
      if (!this.isValidLuhn(sanitizedValue)) {
        errors.push('Invalid card number (failed Luhn check)');
      }

      return {
        isValid: errors.length === 0,
        sanitizedValue,
        errors,
      };
    } catch (error) {
      logger.error('Card number sanitization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isValid: false,
        sanitizedValue: '',
        errors: ['Card number sanitization failed'],
      };
    }
  }

  /**
   * Sanitizes CVV codes
   */
  public sanitizeCvv(cvv: string): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue = cvv;

    try {
      if (typeof cvv !== 'string') {
        return {
          isValid: false,
          sanitizedValue: '',
          errors: ['CVV must be a string'],
        };
      }

      // Remove all non-digit characters
      sanitizedValue = sanitizedValue.replace(/\D/g, '');

      // Validate length (3-4 digits)
      if (sanitizedValue.length < 3 || sanitizedValue.length > 4) {
        errors.push('CVV must be 3 or 4 digits');
      }

      return {
        isValid: errors.length === 0,
        sanitizedValue,
        errors,
      };
    } catch (error) {
      logger.error('CVV sanitization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isValid: false,
        sanitizedValue: '',
        errors: ['CVV sanitization failed'],
      };
    }
  }

  /**
   * Sanitizes monetary amounts
   */
  public sanitizeAmount(amount: string | number): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue: string;

    try {
      // Convert to string if number
      if (typeof amount === 'number') {
        sanitizedValue = amount.toString();
      } else if (typeof amount === 'string') {
        sanitizedValue = amount.trim();
      } else {
        return {
          isValid: false,
          sanitizedValue: '0',
          errors: ['Amount must be a string or number'],
        };
      }

      // Remove currency symbols and spaces
      sanitizedValue = sanitizedValue.replace(/[$,\s]/g, '');

      // Validate decimal format
      if (!/^\d+(\.\d{1,2})?$/.test(sanitizedValue)) {
        errors.push('Invalid amount format');
      }

      const numericValue = parseFloat(sanitizedValue);

      // Check for reasonable limits
      if (numericValue < 0) {
        errors.push('Amount cannot be negative');
      }

      if (numericValue > 999999.99) {
        errors.push('Amount exceeds maximum limit');
      }

      // Format to 2 decimal places
      sanitizedValue = numericValue.toFixed(2);

      return {
        isValid: errors.length === 0,
        sanitizedValue,
        errors,
      };
    } catch (error) {
      logger.error('Amount sanitization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isValid: false,
        sanitizedValue: '0',
        errors: ['Amount sanitization failed'],
      };
    }
  }

  /**
   * Sanitizes SQL-like input to prevent injection
   */
  public sanitizeSqlInput(input: string): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue = input;

    try {
      if (typeof input !== 'string') {
        return {
          isValid: false,
          sanitizedValue: '',
          errors: ['Input must be a string'],
        };
      }

      // Check for common SQL injection patterns
      const sqlInjectionPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
        /(UNION\s+SELECT)/gi,
        /(\bOR\s+['"]?1['"]?\s*=\s*['"]?1['"]?\b)/gi,
        /(\bAND\s+['"]?1['"]?\s*=\s*['"]?1['"]?\b)/gi,
        /(\*\/)/g,
        /(\bxp_cmdshell\b)/gi,
        /(\bsp_executesql\b)/gi,
        /(';\s*(DROP|DELETE|INSERT|UPDATE))/gi,
        /(OR\s+['"]1['"]?\s*=\s*['"]1['"]?)/gi,
      ];

      for (const pattern of sqlInjectionPatterns) {
        if (pattern.test(sanitizedValue)) {
          errors.push('Input contains potentially malicious SQL patterns');
          break;
        }
      }

      // Escape single quotes
      sanitizedValue = sanitizedValue.replace(/'/g, "''");

      // Remove null bytes
      // eslint-disable-next-line no-control-regex
      sanitizedValue = sanitizedValue.replace(/\x00/g, '');

      return {
        isValid: errors.length === 0,
        sanitizedValue,
        errors,
      };
    } catch (error) {
      logger.error('SQL input sanitization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isValid: false,
        sanitizedValue: '',
        errors: ['SQL sanitization failed'],
      };
    }
  }

  /**
   * Sanitizes file names
   */
  public sanitizeFileName(fileName: string): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue = fileName;

    try {
      if (typeof fileName !== 'string') {
        return {
          isValid: false,
          sanitizedValue: '',
          errors: ['File name must be a string'],
        };
      }

      // Remove path traversal attempts
      sanitizedValue = sanitizedValue.replace(/\.\./g, '');
      sanitizedValue = sanitizedValue.replace(/[/\\]/g, '');

      // Remove dangerous characters
      // eslint-disable-next-line no-control-regex
      sanitizedValue = sanitizedValue.replace(/[<>:"|?*\x00-\x1f]/g, '');

      // Trim and remove leading/trailing dots and spaces
      sanitizedValue = sanitizedValue.trim().replace(/^\.+|\.+$/g, '');

      // Check length
      if (sanitizedValue.length === 0) {
        errors.push('File name cannot be empty');
      }

      if (sanitizedValue.length > 255) {
        errors.push('File name too long');
        sanitizedValue = sanitizedValue.substring(0, 255);
      }

      // Check for reserved names (Windows)
      const reservedNames = [
        'CON',
        'PRN',
        'AUX',
        'NUL',
        'COM1',
        'COM2',
        'COM3',
        'COM4',
        'COM5',
        'COM6',
        'COM7',
        'COM8',
        'COM9',
        'LPT1',
        'LPT2',
        'LPT3',
        'LPT4',
        'LPT5',
        'LPT6',
        'LPT7',
        'LPT8',
        'LPT9',
      ];
      if (reservedNames.includes(sanitizedValue.toUpperCase())) {
        errors.push('File name is reserved');
      }

      return {
        isValid: errors.length === 0,
        sanitizedValue,
        errors,
      };
    } catch (error) {
      logger.error('File name sanitization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isValid: false,
        sanitizedValue: '',
        errors: ['File name sanitization failed'],
      };
    }
  }

  /**
   * Luhn algorithm for credit card validation
   */
  private isValidLuhn(cardNumber: string): boolean {
    let sum = 0;
    let alternate = false;

    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let n = parseInt(cardNumber.charAt(i), 10);

      if (alternate) {
        n *= 2;
        if (n > 9) {
          n = (n % 10) + 1;
        }
      }

      sum += n;
      alternate = !alternate;
    }

    return sum % 10 === 0;
  }

  /**
   * Sanitizes object properties recursively
   */
  public sanitizeObject(obj: any, options: SanitizationOptions = {}): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.sanitizeText(obj, options).sanitizedValue;
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item, options));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = this.sanitizeText(key, {
          maxLength: 100,
        }).sanitizedValue;
        sanitized[sanitizedKey] = this.sanitizeObject(value, options);
      }
      return sanitized;
    }

    return obj;
  }
}

export const inputSanitizer = InputSanitizer.getInstance();
