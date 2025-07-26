import {
  ChangeMessageVisibilityCommand,
  DeleteMessageBatchCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  QueueAttributeName,
  SQSClient,
  Message as SqsMessage,
} from '@aws-sdk/client-sqs';
import { DiscoveryService } from '@golevelup/nestjs-discovery';
import { Inject, Injectable, Logger, LoggerService, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, StopOptions } from 'sqs-consumer';
import { Producer } from 'sqs-producer';
import { SQS_CONSUMER_EVENT_HANDLER, SQS_CONSUMER_METHOD, SQS_OPTIONS } from './sqs.constants';
import {
  Message,
  QueueName,
  SqsConsumerEventHandlerMeta,
  SqsConsumerMapValues,
  SqsMessageHandlerMeta,
  SqsOptions,
} from './sqs.types';

@Injectable()
export class SqsService implements OnModuleInit, OnModuleDestroy {
  public readonly consumers = new Map<QueueName, SqsConsumerMapValues>();
  public readonly producers = new Map<QueueName, Producer>();

  private logger: LoggerService;
  private globalStopOptions: StopOptions;

  public constructor(
    @Inject(SQS_OPTIONS) public readonly options: SqsOptions,
    private readonly discover: DiscoveryService,
  ) {}

  public async onModuleInit(): Promise<void> {
    this.logger = this.options.logger ?? new Logger('SqsService', { timestamp: false });
    this.globalStopOptions = this.options.globalStopOptions ?? {};

    const messageHandlers =
      await this.discover.providerMethodsWithMetaAtKey<SqsMessageHandlerMeta>(SQS_CONSUMER_METHOD);
    const eventHandlers =
      await this.discover.providerMethodsWithMetaAtKey<SqsConsumerEventHandlerMeta>(SQS_CONSUMER_EVENT_HANDLER);

    this.options.consumers?.forEach((options) => {
      const { name, stopOptions, ...consumerOptions } = options;
      if (this.consumers.has(name)) {
        throw new Error(`Consumer already exists: ${name}`);
      }

      const metadata = messageHandlers.find(({ meta }) => meta.name === name);
      if (!metadata) {
        this.logger.warn(`No metadata found for: ${name}`);
        return;
      }

      const isBatchHandler = metadata.meta.batch === true;
      const consumer = Consumer.create({
        ...consumerOptions,
        ...(isBatchHandler
          ? {
              handleMessageBatch: metadata.discoveredMethod.handler.bind(
                metadata.discoveredMethod.parentClass.instance,
              ),
            }
          : { handleMessage: metadata.discoveredMethod.handler.bind(metadata.discoveredMethod.parentClass.instance) }),
      });

      const eventsMetadata = eventHandlers.filter(({ meta }) => meta.name === name);
      for (const eventMetadata of eventsMetadata) {
        if (eventMetadata) {
          consumer.addListener(
            eventMetadata.meta.eventName,
            eventMetadata.discoveredMethod.handler.bind(metadata.discoveredMethod.parentClass.instance),
          );
        }
      }
      this.consumers.set(name, { instance: consumer, stopOptions: stopOptions ?? this.globalStopOptions });
    });

    this.options.producers?.forEach((options) => {
      const { name, ...producerOptions } = options;
      if (this.producers.has(name)) {
        throw new Error(`Producer already exists: ${name}`);
      }

      const producer = Producer.create(producerOptions);
      this.producers.set(name, producer);
    });

    for (const consumer of this.consumers.values()) {
      consumer.instance.start();
    }
  }

  public onModuleDestroy() {
    for (const consumer of this.consumers.values()) {
      consumer.instance.stop(consumer.stopOptions);
    }
  }

  private getQueueInfo(name: QueueName) {
    if (!this.consumers.has(name) && !this.producers.has(name)) {
      throw new Error(`Consumer/Producer does not exist: ${name}`);
    }

    const { sqs, queueUrl } = (this.consumers.get(name)?.instance ?? this.producers.get(name)) as {
      sqs: SQSClient;
      queueUrl: string;
    };
    if (!sqs) {
      throw new Error('SQS instance does not exist');
    }

    return {
      sqs,
      queueUrl,
    };
  }

  public async purgeQueue(name: QueueName) {
    const { sqs, queueUrl } = this.getQueueInfo(name);
    const command = new PurgeQueueCommand({
      QueueUrl: queueUrl,
    });
    return await sqs.send(command);
  }

  public async getQueueAttributes(name: QueueName) {
    const { sqs, queueUrl } = this.getQueueInfo(name);
    const command = new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['All'],
    });
    const response = await sqs.send(command);
    return response.Attributes as { [key in QueueAttributeName]: string };
  }

  public getProducerQueueSize(name: QueueName) {
    if (!this.producers.has(name)) {
      throw new Error(`Producer does not exist: ${name}`);
    }

    return this.producers.get(name).queueSize();
  }

  public send<T = any>(name: QueueName, payload: Message<T> | Message<T>[]) {
    if (!this.producers.has(name)) {
      throw new Error(`Producer does not exist: ${name}`);
    }

    const originalMessages = Array.isArray(payload) ? payload : [payload];
    const messages = originalMessages.map((message) => {
      let body = message.body;
      if (typeof body !== 'string') {
        body = JSON.stringify(body) as any;
      }

      return {
        ...message,
        body,
      };
    });

    const producer = this.producers.get(name);
    return producer.send(messages as any[]);
  }

  public async deleteMessage(name: QueueName, receiptHandle: string) {
    if (!this.consumers.has(name)) {
      throw new Error(`Consumer does not exist: ${name}`);
    }

    const { sqs, queueUrl } = this.getQueueInfo(name);

    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    });

    return await sqs.send(command);
  }

  public async deleteMessageBatch(
    name: QueueName,
    messages: SqsMessage[] | Pick<SqsMessage, 'MessageId' | 'ReceiptHandle'>[],
  ) {
    if (!this.consumers.has(name)) {
      throw new Error(`Consumer does not exist: ${name}`);
    }

    const { sqs, queueUrl } = this.getQueueInfo(name);


    const commands = new DeleteMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: messages.map((message) => {
        return {
          Id: message.MessageId,
          ReceiptHandle: message.ReceiptHandle,
        };
      }),
    });

    return await sqs.send(commands);
  }

  public async changeMessageVisibility(name: QueueName, receiptHandle: string, visibilityTimeout: number) {
    if (!this.consumers.has(name)) {
      throw new Error(`Consumer does not exist: ${name}`);
    }

    const { sqs, queueUrl } = this.getQueueInfo(name);


    const command = new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: visibilityTimeout,
    });

    return await sqs.send(command);
  }
}
