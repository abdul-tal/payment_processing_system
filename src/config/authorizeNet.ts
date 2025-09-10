import dotenv from 'dotenv';

dotenv.config();

export interface AuthorizeNetConfig {
  apiLoginId: string;
  transactionKey: string;
  environment: 'sandbox' | 'production';
  endpoint: string;
}

class AuthorizeNetConfigService {
  private config: AuthorizeNetConfig;

  constructor() {
    this.validateEnvironmentVariables();
    this.config = this.createConfig();
  }

  private validateEnvironmentVariables(): void {
    const requiredVars = ['AUTHNET_API_LOGIN_ID', 'AUTHNET_TRANSACTION_KEY'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      throw new Error(
        `Missing required Authorize.Net environment variables: ${missingVars.join(', ')}`
      );
    }
  }

  private createConfig(): AuthorizeNetConfig {
    const environment =
      (process.env.AUTHNET_ENVIRONMENT as 'sandbox' | 'production') ||
      'sandbox';

    return {
      apiLoginId: process.env.AUTHNET_API_LOGIN_ID!,
      transactionKey: process.env.AUTHNET_TRANSACTION_KEY!,
      environment,
      endpoint:
        environment === 'production'
          ? 'https://api.authorize.net/xml/v1/request.api'
          : 'https://apitest.authorize.net/xml/v1/request.api',
    };
  }

  public getConfig(): AuthorizeNetConfig {
    return { ...this.config };
  }

  public isProduction(): boolean {
    return this.config.environment === 'production';
  }

  public isSandbox(): boolean {
    return this.config.environment === 'sandbox';
  }
}

export const authorizeNetConfig = new AuthorizeNetConfigService();
