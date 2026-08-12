import { HisQueryPublishProcessor } from '../his-query-publish.processor';

/**
 * D.6 ("production publication lifecycle," 2026-07-22). Deliberately thin
 * tests matching this processor's own deliberately thin implementation --
 * same shape as `ConnectorJobDispatchProcessor`'s own scope (just prove
 * the job name routes to the right publisher method with the right args).
 */
describe('HisQueryPublishProcessor', () => {
  function makeProcessor() {
    const publisher = {
      publishFull: jest.fn().mockResolvedValue({ tenantId: 't1', changedQueryIds: [], skippedQueryIds: [], pushed: true }),
      publishChanged: jest.fn().mockResolvedValue({ tenantId: 't1', changedQueryIds: [], skippedQueryIds: [], pushed: false }),
    };
    const processor = new HisQueryPublishProcessor(publisher as any);
    return { processor, publisher };
  }

  it('handlePublishFull() delegates to publisher.publishFull() with tenantId and connectorId', async () => {
    const { processor, publisher } = makeProcessor();
    const job = { data: { tenantId: 't1', connectorId: 'c1' } } as any;

    const result = await processor.handlePublishFull(job);

    expect(publisher.publishFull).toHaveBeenCalledWith('t1', 'c1');
    expect(result.pushed).toBe(true);
  });

  it('handlePublishChanged() delegates to publisher.publishChanged() with tenantId only', async () => {
    const { processor, publisher } = makeProcessor();
    const job = { data: { tenantId: 't1' } } as any;

    const result = await processor.handlePublishChanged(job);

    expect(publisher.publishChanged).toHaveBeenCalledWith('t1');
    expect(result.pushed).toBe(false);
  });

  it('onFailed() logs without throwing', () => {
    const { processor } = makeProcessor();
    const job = { name: 'publish-full', data: { tenantId: 't1' }, attemptsMade: 3 } as any;
    expect(() => processor.onFailed(job, new Error('boom'))).not.toThrow();
  });
});
