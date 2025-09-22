import crypto from 'crypto';
import { logger } from '../config/logger';

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  tagLength: number;
  saltLength: number;
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;
}

export class EncryptionService {
  private static instance: EncryptionService;
  private readonly config: EncryptionConfig;
  private masterKey: string = '';

  private constructor() {
    this.config = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      tagLength: 16,
      saltLength: 32,
    };

    this.initializeMasterKey();
  }

  private initializeMasterKey(): void {
    this.masterKey = process.env['ENCRYPTION_MASTER_KEY'] || '';
    if (!this.masterKey) {
      throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
    }

    if (this.masterKey.length < 32) {
      throw new Error(
        'ENCRYPTION_MASTER_KEY must be at least 32 characters long'
      );
    }
  }

  public static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  /**
   * Derives a key from the master key using PBKDF2
   */
  private deriveKey(salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      100000, // iterations
      this.config.keyLength,
      'sha256'
    );
  }

  /**
   * Encrypts sensitive data using AES-256-GCM
   */
  public encrypt(plaintext: string): EncryptedData {
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.config.saltLength);
      const iv = crypto.randomBytes(this.config.ivLength);

      // Derive key from master key and salt
      const key = this.deriveKey(salt);

      // Create cipher
      const cipher = crypto.createCipheriv(
        this.config.algorithm,
        key,
        iv
      ) as crypto.CipherGCM;
      cipher.setAAD(Buffer.from('payment-data')); // Additional authenticated data

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const tag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        salt: salt.toString('hex'),
      };
    } catch (error) {
      logger.error('Encryption failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts data encrypted with encrypt method
   */
  public decrypt(encryptedData: EncryptedData): string {
    try {
      // Convert hex strings back to buffers
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const ivBuffer = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');

      // Derive the same key
      const key = this.deriveKey(salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.config.algorithm,
        key,
        ivBuffer
      ) as crypto.DecipherGCM;
      decipher.setAuthTag(tag);
      decipher.setAAD(Buffer.from('payment-data'));

      // Decrypt the data
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypts credit card number (PCI DSS requirement)
   */
  public encryptCardNumber(cardNumber: string): EncryptedData {
    // Remove any spaces or dashes
    const cleanCardNumber = cardNumber.replace(/[\s-]/g, '');

    // Validate card number format
    if (!/^\d{13,19}$/.test(cleanCardNumber)) {
      throw new Error('Invalid card number format');
    }

    return this.encrypt(cleanCardNumber);
  }

  /**
   * Encrypts CVV (PCI DSS requirement)
   */
  public encryptCvv(cvv: string): EncryptedData {
    // Validate CVV format
    if (!/^\d{3,4}$/.test(cvv)) {
      throw new Error('Invalid CVV format');
    }

    return this.encrypt(cvv);
  }

  /**
   * Encrypts bank account number
   */
  public encryptBankAccount(accountNumber: string): EncryptedData {
    // Remove any spaces or dashes
    const cleanAccountNumber = accountNumber.replace(/[\s-]/g, '');

    // Basic validation
    if (!/^\d{4,17}$/.test(cleanAccountNumber)) {
      throw new Error('Invalid bank account number format');
    }

    return this.encrypt(cleanAccountNumber);
  }

  /**
   * Encrypts routing number
   */
  public encryptRoutingNumber(routingNumber: string): EncryptedData {
    // Remove any spaces or dashes
    const cleanRoutingNumber = routingNumber.replace(/[\s-]/g, '');

    // Validate routing number (9 digits)
    if (!/^\d{9}$/.test(cleanRoutingNumber)) {
      throw new Error('Invalid routing number format');
    }

    return this.encrypt(cleanRoutingNumber);
  }

  /**
   * Encrypts SSN (Social Security Number)
   */
  public encryptSsn(ssn: string): EncryptedData {
    // Remove any spaces or dashes
    const cleanSsn = ssn.replace(/[\s-]/g, '');

    // Validate SSN format (9 digits)
    if (!/^\d{9}$/.test(cleanSsn)) {
      throw new Error('Invalid SSN format');
    }

    return this.encrypt(cleanSsn);
  }

  /**
   * Creates a hash for data integrity verification
   */
  public createHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verifies data integrity using hash
   */
  public verifyHash(data: string, hash: string): boolean {
    const computedHash = this.createHash(data);
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(computedHash, 'hex')
    );
  }

  /**
   * Masks sensitive data for logging (shows only last 4 digits)
   */
  public maskCardNumber(cardNumber: string): string {
    const clean = cardNumber.replace(/[\s-]/g, '');
    if (clean.length < 4) return '****';
    return '*'.repeat(clean.length - 4) + clean.slice(-4);
  }

  /**
   * Masks bank account for logging (shows only last 4 digits)
   */
  public maskBankAccount(accountNumber: string): string {
    const clean = accountNumber.replace(/[\s-]/g, '');
    if (clean.length < 4) return '****';
    return '*'.repeat(clean.length - 4) + clean.slice(-4);
  }

  /**
   * Completely masks CVV for logging
   */
  public maskCvv(): string {
    return '***';
  }

  /**
   * Masks SSN for logging (shows only last 4 digits)
   */
  public maskSsn(ssn: string): string {
    const clean = ssn.replace(/[\s-]/g, '');
    if (clean.length < 4) return '***-**-****';
    return '***-**-' + clean.slice(-4);
  }
}

// Export the class, not a singleton instance to avoid initialization issues
// Use EncryptionService.getInstance() when needed
