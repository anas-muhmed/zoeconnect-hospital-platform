export interface SignatureCaptureContext {
  instanceId: string;
  fieldKey: string;
  signerRole: string;
  signedByUserId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SignatureValidationResult {
  valid: boolean;
  signerHash: string;
}

export interface ISignatureProvider {
  /** Given a base64 or vector signature payload, store it securely and return the integrity hash. */
  captureSignature(payload: string, ctx: SignatureCaptureContext): Promise<string>;
  
  /** Given a signature hash, verify that it matches the instance and has not been tampered with. */
  validateSignature(hash: string, ctx: Omit<SignatureCaptureContext, 'ipAddress' | 'userAgent'>): Promise<SignatureValidationResult>;
}
