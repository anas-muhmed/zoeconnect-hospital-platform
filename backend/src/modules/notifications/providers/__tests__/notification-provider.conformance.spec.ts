/**
 * Phase 5 ("Notification Providers", Task 5.5) — INotificationProvider
 * conformance suite, run against both bound implementations
 * (LocalNotificationProvider, CloudNotificationProvider) in CI's normal
 * "Unit tests" step. No live AWS/WhatsApp credentials needed -- the
 * underlying transport (NOTIFICATION_TRANSPORT) and the AWS SDK clients
 * are both mocked, matching Phase 4's ILicenseProvider conformance
 * approach (mocked dependencies) rather than Phase 3's MinIO-backed live
 * S3 conformance suite -- there's no equivalent free-to-run local SES/SNS
 * emulator readily available, so live-service conformance testing here is
 * logged as a follow-up (e.g. LocalStack), not attempted in this pass.
 *
 * A single `assertConformsToInterface` helper runs the same structural
 * assertions against whatever `INotificationProvider` it's handed, so a
 * future third provider only needs one more `describe` block.
 */
import { ConfigService } from '@nestjs/config';
import { LocalNotificationProvider } from '../local-notification.provider';
import { CloudNotificationProvider } from '../cloud-notification.provider';
import { INotificationProvider, NotificationResult } from '../../../platform/infrastructure/notifications/notification-provider.interface';
import { INotificationTransport } from '../../../platform/infrastructure/notifications/notification-transport.interface';

// Mock the AWS SDK clients so CloudNotificationProvider never makes a real
// network call in unit tests -- only its own mapping logic (result shape,
// error handling) is under test here, not AWS SES/SNS's actual behavior.
const sesSendMock = jest.fn();
const snsSendMock = jest.fn();
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: sesSendMock })),
  SendEmailCommand: jest.fn().mockImplementation((input) => input),
}));
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: snsSendMock })),
  PublishCommand: jest.fn().mockImplementation((input) => input),
}));

function assertResultShape(result: NotificationResult) {
  expect(typeof result.success).toBe('boolean');
  expect(typeof result.retryable).toBe('boolean');
  if (!result.success) {
    expect(typeof result.errorCode).toBe('string');
  }
}

async function assertConformsToInterface(provider: INotificationProvider) {
  expect(typeof provider.id).toBe('string');
  expect(typeof provider.name).toBe('string');

  const health = await provider.healthCheck();
  for (const channel of ['sms', 'whatsapp', 'email', 'push'] as const) {
    expect(typeof health[channel]).toBe('boolean');
  }

  const pushResult = await provider.sendPush('device-token', 'Title', 'Body');
  assertResultShape(pushResult);
  // No provider implements push yet -- the contract still holds (a
  // structured failure, not a thrown error).
  expect(pushResult.success).toBe(false);
  expect(pushResult.errorCode).toBe('NOT_IMPLEMENTED');
}

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    WHATSAPP_ACCESS_TOKEN: 'token',
    WHATSAPP_PHONE_NUMBER_ID: '12345',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'AKIAFAKE',
    AWS_SECRET_ACCESS_KEY: 'fake-secret',
    SES_FROM_EMAIL: 'noreply@example.com',
    ...overrides,
  };
  return { get: (key: string, def?: string) => values[key] ?? def } as unknown as ConfigService;
}

function makeTransport(impl: 'success' | 'failure'): INotificationTransport {
  return {
    sendTemplate: jest.fn().mockImplementation(() =>
      impl === 'success' ? Promise.resolve('wa-msg-123') : Promise.reject(new Error('Meta API 500')),
    ),
  };
}

describe('INotificationProvider conformance', () => {
  describe('LocalNotificationProvider', () => {
    it('conforms to the interface', async () => {
      const provider = new LocalNotificationProvider(makeTransport('success'), makeConfig());
      await assertConformsToInterface(provider);
    });

    it('sendWhatsApp delegates to NOTIFICATION_TRANSPORT and returns success:true on delivery', async () => {
      const provider = new LocalNotificationProvider(makeTransport('success'), makeConfig());
      const result = await provider.sendWhatsApp('+911234567890', 'welcome', 'en_US', ['Alice']);
      assertResultShape(result);
      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('wa-msg-123');
    });

    it('sendWhatsApp returns a retryable failure (not a throw) when the transport throws', async () => {
      const provider = new LocalNotificationProvider(makeTransport('failure'), makeConfig());
      const result = await provider.sendWhatsApp('+911234567890', 'welcome', 'en_US', ['Alice']);
      assertResultShape(result);
      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it('sendSms/sendEmail replicate the pre-Phase-5 stub behavior: always succeed with a stub ID', async () => {
      const provider = new LocalNotificationProvider(makeTransport('success'), makeConfig());
      const sms = await provider.sendSms('+911234567890', 'hello');
      const email = await provider.sendEmail('a@b.com', 'subject', 'body');
      expect(sms.success).toBe(true);
      expect(sms.providerMessageId).toMatch(/^sms-stub-/);
      expect(email.success).toBe(true);
      expect(email.providerMessageId).toMatch(/^email-stub-/);
    });

    it('healthCheck reflects WhatsApp configuration and stubbed-off SMS/Email', async () => {
      const provider = new LocalNotificationProvider(makeTransport('success'), makeConfig());
      const health = await provider.healthCheck();
      expect(health).toEqual({ whatsapp: true, sms: false, email: false, push: false });
    });
  });

  describe('CloudNotificationProvider', () => {
    beforeEach(() => {
      sesSendMock.mockReset();
      snsSendMock.mockReset();
    });

    it('conforms to the interface', async () => {
      const provider = new CloudNotificationProvider(makeTransport('success'), makeConfig());
      await assertConformsToInterface(provider);
    });

    it('sendEmail calls SES and maps a MessageId to success:true', async () => {
      sesSendMock.mockResolvedValue({ MessageId: 'ses-msg-1' });
      const provider = new CloudNotificationProvider(makeTransport('success'), makeConfig());
      const result = await provider.sendEmail('a@b.com', 'subject', 'body');
      assertResultShape(result);
      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('ses-msg-1');
      expect(sesSendMock).toHaveBeenCalledTimes(1);
    });

    it('sendEmail maps an SES rejection to a structured failure, not a throw', async () => {
      sesSendMock.mockRejectedValue(new Error('SES throttled'));
      const provider = new CloudNotificationProvider(makeTransport('success'), makeConfig());
      const result = await provider.sendEmail('a@b.com', 'subject', 'body');
      assertResultShape(result);
      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('PROVIDER_ERROR');
    });

    it('sendSms calls SNS and maps a MessageId to success:true', async () => {
      snsSendMock.mockResolvedValue({ MessageId: 'sns-msg-1' });
      const provider = new CloudNotificationProvider(makeTransport('success'), makeConfig());
      const result = await provider.sendSms('+911234567890', 'hello');
      assertResultShape(result);
      expect(result.success).toBe(true);
      expect(result.providerMessageId).toBe('sns-msg-1');
    });

    it('sendWhatsApp shares NOTIFICATION_TRANSPORT with LocalNotificationProvider', async () => {
      const transport = makeTransport('success');
      const provider = new CloudNotificationProvider(transport, makeConfig());
      const result = await provider.sendWhatsApp('+911234567890', 'welcome', 'en_US', ['Alice']);
      expect(result.success).toBe(true);
      expect(transport.sendTemplate).toHaveBeenCalledTimes(1);
    });

    it('healthCheck reflects configured SES/SNS credentials', async () => {
      const provider = new CloudNotificationProvider(makeTransport('success'), makeConfig());
      const health = await provider.healthCheck();
      expect(health.email).toBe(true);
      expect(health.sms).toBe(true);
      expect(health.push).toBe(false);
    });
  });
});
