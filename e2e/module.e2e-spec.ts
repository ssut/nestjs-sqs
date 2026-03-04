import { Message, SQSClient } from '@aws-sdk/client-sqs';
import { Injectable } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Consumer } from 'sqs-consumer';
import { vi } from 'vitest';
import { beforeAll } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { afterAll } from 'vitest';
import { it } from 'vitest';
import { afterEach } from 'vitest';
import { SqsModule, SqsService } from '../lib';
import { SqsConsumerEventHandler, SqsMessageHandler } from '../lib/sqs.decorators';
import { SqsConsumerOptions, SqsConsumerMapValues, SqsProducerOptions } from '../lib/sqs.types';

const SQS_ENDPOINT = process.env.SQS_ENDPOINT || 'http://localhost:9324/000000000000';

enum TestQueue {
  Test = 'test',
  DLQ = 'test-dead',
}

const sqs = new SQSClient({
  apiVersion: '2012-11-05',
  credentials: { accessKeyId: 'x', secretAccessKey: 'x' },
  endpoint: SQS_ENDPOINT,
  region: 'us-west-2',
});

const TestQueues: { [key in TestQueue]: SqsConsumerOptions | SqsProducerOptions } = {
  [TestQueue.Test]: {
    name: TestQueue.Test,
    queueUrl: `${SQS_ENDPOINT}/test.fifo`,
    sqs,
  },
  [TestQueue.DLQ]: {
    name: TestQueue.DLQ,
    queueUrl: `${SQS_ENDPOINT}/test-dead.fifo`,
    sqs,
  },
};

describe('SqsModule', () => {
  let module: TestingModule;

  describe('registerAsync', () => {
    let module: TestingModule;

    afterAll(async () => {
      await module?.close();
    });

    it('should register module async', async () => {
      module = await Test.createTestingModule({
        imports: [
          SqsModule.registerAsync({
            useFactory: async () => {
              return {
                consumers: [TestQueues[TestQueue.Test]],
                producers: [TestQueues[TestQueue.Test]],
              };
            },
          }),
        ],
      }).compile();

      const sqsService = module.get(SqsService);
      expect(sqsService).toBeTruthy();
      expect(sqsService.options.consumers).toHaveLength(1);
      expect(sqsService.options.producers).toHaveLength(1);
    });
  });

  describe('full flow', () => {
    const fakeProcessor = vi.fn();
    const fakeDLQProcessor = vi.fn();
    const fakeErrorEventHandler = vi.fn();

    @Injectable()
    class A {
      public constructor(public readonly sqsService: SqsService) {}

      @SqsMessageHandler(TestQueue.Test)
      public async handleTestMessage(message: Message) {
        fakeProcessor(message);
      }

      @SqsConsumerEventHandler(TestQueue.Test, 'processing_error')
      public handleErrorEvent(err: Error, message: Message) {
        fakeErrorEventHandler(err, message);
      }

      @SqsMessageHandler(TestQueue.DLQ)
      public async handleDLQMessage(message: Message) {
        fakeDLQProcessor(message);
      }
    }

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          SqsModule.register({
            consumers: [
              {
                ...TestQueues[TestQueue.Test],
                waitTimeSeconds: 1,
                batchSize: 3,
                terminateVisibilityTimeout: true,
                messageAttributeNames: ['All'],
              },
              {
                ...TestQueues[TestQueue.DLQ],
                waitTimeSeconds: 1,
              },
            ],
            producers: [
              {
                ...TestQueues[TestQueue.Test],
              },
            ],
          }),
        ],
        providers: [A],
      }).compile();
      await module.init();

      const sqsService = module.get(SqsService);
      await Promise.all(Object.values(TestQueue).map((queueName) => sqsService.purgeQueue(queueName)));
    });

    afterEach(() => {
      fakeProcessor.mockReset();
      fakeErrorEventHandler.mockReset();
    });

    afterAll(async () => {
      fakeDLQProcessor.mockReset();
      await module.close();
    });

    it('should register message handler', () => {
      const sqsService = module.get(SqsService);
      expect(sqsService.consumers.has(TestQueue.Test)).toBe(true);
    });

    it('should register message producer', () => {
      const sqsService = module.get(SqsService);
      expect(sqsService.producers.has(TestQueue.Test)).toBe(true);
    });

    it('should call message handler when a new message has come', async () => {
      const sqsService = module.get(SqsService);
      const id = String(Math.floor(Math.random() * 1000000));

      await new Promise<void>(async (resolve, reject) => {
        try {
          fakeProcessor.mockImplementation((message) => {
            expect(message).toBeTruthy();
            expect(JSON.parse(message.Body)).toStrictEqual({ test: true });
            resolve();
          });

          await sqsService.send(TestQueue.Test, {
            id,
            body: { test: true },
            delaySeconds: 0,
            groupId: 'test',
            deduplicationId: id,
          });
        } catch (e) {
          reject(e);
        }
      });
    }, 5000);

    it('should call message handler multiple times when multiple messages have come', async () => {
      const sqsService = module.get(SqsService);
      const groupId = String(Math.floor(Math.random() * 1000000));

      await Promise.all(
        Array.from({ length: 3 }).map(async (_, i) => {
          const id = `${groupId}_${i}`;
          await sqsService.send(TestQueue.Test, {
            id,
            body: { test: true, i },
            delaySeconds: 0,
            groupId,
            deduplicationId: id,
          });
        }),
      );

      await vi.waitFor(
        () => {
          expect(fakeProcessor.mock.calls).toHaveLength(3);
          for (const call of fakeProcessor.mock.calls) {
            expect(call).toHaveLength(1);
            expect(call[0]).toBeTruthy();
          }
        },
        {
          interval: 100,
          timeout: 5000,
        },
      );
    }, 5500);

    it('should call the registered error handler when an error occurs', async () => {
      const sqsService = module.get(SqsService);
      const id = String(Math.floor(Math.random() * 1000000));
      fakeProcessor.mockImplementation((_message) => {
        throw new Error('test');
      });

      await new Promise<void>(async (resolve, reject) => {
        try {
          fakeErrorEventHandler.mockImplementationOnce((error, _message) => {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain('test');
            resolve();
          });

          await sqsService.send(TestQueue.Test, {
            id,
            body: { test: true },
            delaySeconds: 0,
            groupId: 'test',
            deduplicationId: id,
          });
        } catch (e) {
          reject(e);
        }
      });
    }, 5000);

    it('should consume a dead letter from DLQ', async () => {
      await vi.waitFor(
        () => {
          expect(fakeDLQProcessor.mock.calls.length).toBe(1);
        },
        {
          interval: 500,
          timeout: 9900,
        },
      );
    }, 10000);
  });

  describe('graceful shutdown', () => {
    it('should await all consumers to emit stopped before onModuleDestroy resolves', async () => {
      const sqsService = new SqsService(
        { consumers: [], producers: [] },
        {} as any,
      );

      const consumer1 = Consumer.create({ queueUrl: 'http://fake/q1', sqs, handleMessage: async () => {} });
      const consumer2 = Consumer.create({ queueUrl: 'http://fake/q2', sqs, handleMessage: async () => {} });

      consumer1.on('error', () => {});
      consumer2.on('error', () => {});

      consumer1.start();
      consumer2.start();

      sqsService.consumers.set('q1', { instance: consumer1, stopOptions: {} });
      sqsService.consumers.set('q2', { instance: consumer2, stopOptions: {} });

      expect(consumer1.status.isRunning).toBe(true);
      expect(consumer2.status.isRunning).toBe(true);

      await sqsService.onModuleDestroy();

      expect(consumer1.status.isRunning).toBe(false);
      expect(consumer2.status.isRunning).toBe(false);
    });

    it('should not hang when a consumer is already stopped', async () => {
      const sqsService = new SqsService(
        { consumers: [], producers: [] },
        {} as any,
      );

      const consumer = Consumer.create({ queueUrl: 'http://fake/q1', sqs, handleMessage: async () => {} });
      // Consumer is created in stopped state (never started), status.isRunning === false
      expect(consumer.status.isRunning).toBe(false);

      sqsService.consumers.set('q1', { instance: consumer, stopOptions: {} });

      // This must resolve immediately, not hang forever
      await sqsService.onModuleDestroy();
    });

    it('should pass stopOptions to consumer.stop()', async () => {
      const sqsService = new SqsService(
        { consumers: [], producers: [] },
        {} as any,
      );

      const consumer = Consumer.create({ queueUrl: 'http://fake/q1', sqs, handleMessage: async () => {} });
      consumer.on('error', () => {});
      consumer.start();

      const stopSpy = vi.spyOn(consumer, 'stop');
      const stopOptions = { abort: true };
      sqsService.consumers.set('q1', { instance: consumer, stopOptions });

      await sqsService.onModuleDestroy();

      expect(stopSpy).toHaveBeenCalledWith(stopOptions);
      stopSpy.mockRestore();
    });

    it('should resolve immediately when there are no consumers', async () => {
      const sqsService = new SqsService(
        { consumers: [], producers: [] },
        {} as any,
      );

      // No consumers registered at all
      await sqsService.onModuleDestroy();
    });
  });
});
