import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { Message, SQSClient } from '@aws-sdk/client-sqs';
import { Test, TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SqsModule, SqsService } from '../lib';
import { SqsMessageHandler } from '../lib/sqs.decorators';

const SQS_ENDPOINT = process.env.SQS_ENDPOINT || 'http://localhost:9324/000000000000';
const QUEUE_NAME = 'test';

const sqs = new SQSClient({
  apiVersion: '2012-11-05',
  credentials: { accessKeyId: 'x', secretAccessKey: 'x' },
  endpoint: SQS_ENDPOINT,
  region: 'us-west-2',
});

const WITH_METRICS_KEY = Symbol('WITH_METRICS_KEY');
const WithMetrics = (operationName: string) => SetMetadata(WITH_METRICS_KEY, { operationName });

@Injectable()
class MetricsExecutor implements OnApplicationBootstrap {
  public readonly calls: string[] = [];

  public constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) { }

  onApplicationBootstrap(): void {
    for (const wrapper of this.discovery.getProviders().filter((p) => p.instance)) {
      const instance = wrapper.instance as Record<string, (...args: unknown[]) => unknown>;
      const prototype = Object.getPrototypeOf(instance);
      if (!prototype) continue;

      for (const methodName of this.scanner.getAllMethodNames(prototype)) {
        const original = instance[methodName];
        if (typeof original !== 'function') continue;

        const meta = this.reflector.get<{ operationName: string }>(WITH_METRICS_KEY, original);
        if (!meta) continue;

        instance[methodName] = (...args: unknown[]) => {
          this.calls.push(meta.operationName);
          return original.apply(instance, args);
        };
      }
    }
  }
}

@Injectable()
class DemoConsumer {
  @SqsMessageHandler(QUEUE_NAME, false)
  @WithMetrics('demo_operation')
  async handleMessage(message: Message): Promise<void> {
    void message;
  }
}

describe('SqsModule > post-boot method wrapping', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        DiscoveryModule,
        SqsModule.register({
          consumers: [{ name: QUEUE_NAME, queueUrl: `${SQS_ENDPOINT}/test.fifo`, sqs, waitTimeSeconds: 1 }],
          producers: [{ name: QUEUE_NAME, queueUrl: `${SQS_ENDPOINT}/test.fifo`, sqs }],
        }),
      ],
      providers: [DemoConsumer, MetricsExecutor],
    }).compile();

    await module.init();

    const sqsService = module.get(SqsService);
    await sqsService.purgeQueue(QUEUE_NAME);
  });

  afterAll(async () => {
    await module.close();
  });

  it('a method wrapped by a DiscoveryService-based executor after module init still runs when dispatched via SqsService', async () => {
    const sqsService = module.get(SqsService);
    const metrics = module.get(MetricsExecutor);
    const id = String(Math.floor(Math.random() * 1000000));

    await sqsService.send(QUEUE_NAME, {
      id,
      body: { test: true },
      delaySeconds: 0,
      groupId: 'test',
      deduplicationId: id,
    });

    // Before the fix: metrics.calls stayed [] forever here - SqsService had already
    // `.bind()`-captured the pre-wrapping snapshot of handleMessage at onModuleInit,
    // before MetricsExecutor's onApplicationBootstrap wrapped it.
    await vi.waitFor(
      () => {
        expect(metrics.calls).toEqual(['demo_operation']);
      },
      { interval: 100, timeout: 5000 },
    );
  }, 5500);
});
