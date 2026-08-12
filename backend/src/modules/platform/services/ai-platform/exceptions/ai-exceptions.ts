export class AiPlatformException extends Error {
  constructor(message: string, public readonly metadata?: Record<string, any>) {
    super(message);
    this.name = 'AiPlatformException';
  }
}

export class AiAuthenticationException extends AiPlatformException {
  constructor(message = 'AI Provider authentication failed', metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'AiAuthenticationException';
  }
}

export class AiQuotaExceededException extends AiPlatformException {
  constructor(message = 'AI Provider quota exceeded', metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'AiQuotaExceededException';
  }
}

export class AiRateLimitedException extends AiPlatformException {
  constructor(message = 'AI Provider rate limit exceeded', metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'AiRateLimitedException';
  }
}

export class AiProviderUnavailableException extends AiPlatformException {
  constructor(message = 'AI Provider is currently unavailable', metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'AiProviderUnavailableException';
  }
}

export class AiValidationException extends AiPlatformException {
  constructor(message = 'AI Provider returned invalid or malformed output', metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'AiValidationException';
  }
}

export class AiSafetyException extends AiPlatformException {
  constructor(message = 'AI Provider request or response flagged for safety reasons', metadata?: Record<string, any>) {
    super(message, metadata);
    this.name = 'AiSafetyException';
  }
}
