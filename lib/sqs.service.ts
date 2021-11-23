import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Message, QueueName, SqsConsumerEventHandlerMeta, SqsMessageHandlerMeta, SqsOptions } from './sqs.types';
import { DiscoveryService } from '@nestjs-plus/discovery';
import { SQS_CONSUMER_EVENT_HANDLER, SQS_CONSUMER_METHOD, SQS_OPTIONS } from './sqs.constants';
import { Consumer } from './sqs-consumer';
import { Producer } from './sqs-producer';
import { GetQueueAttributesCommand, PurgeQueueCommand, QueueAttributeName, SQSClient } from '@aws-sdk/client-sqs';

@Injectable()
export class SqsService implements OnModuleInit, OnModuleDestroy {
  public readonly consumers = new Map<QueueName, Consumer>();
  public readonly producers = new Map<QueueName, Producer>();

  private readonly logger = new Logger('SqsService', {
    timestamp: false,
  });

  public constructor(
    @Inject(SQS_OPTIONS) public readonly options: SqsOptions,
    private readonly discover: DiscoveryService,
  ) {}

  public async onModuleInit(): Promise<void> {
    const messageHandlers = await this.discover.providerMethodsWithMetaAtKey<SqsMessageHandlerMeta>(
      SQS_CONSUMER_METHOD,
    );
    const eventHandlers = await this.discover.providerMethodsWithMetaAtKey<SqsConsumerEventHandlerMeta>(
      SQS_CONSUMER_EVENT_HANDLER,
    );

    this.options.consumers?.forEach((options) => {
      const { name, ...consumerOptions } = options;
      if (this.consumers.has(name)) {
        throw new Error(`Consumer already exists: ${name}`);
      }

      const metadata = messageHandlers.find(({ meta }) => meta.name === name);
      if (!metadata) {
        this.logger.warn(`No metadata found for: ${name}`);
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
      this.consumers.set(name, consumer);
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
      consumer.start();
    }
  }

  public onModuleDestroy() {
    for (const consumer of this.consumers.values()) {
      consumer.stop();
    }
  }

  private getQueueInfo(name: QueueName) {
    if (!this.consumers.has(name) && !this.producers.has(name)) {
      throw new Error(`Consumer/Producer does not exist: ${name}`);
    }

    const { sqs, queueUrl } = (this.consumers.get(name) ?? this.producers.get(name)) as {
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
    return sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
  }

  public async getQueueAttributes(name: QueueName) {
    const { sqs, queueUrl } = this.getQueueInfo(name);
    const response = await sqs.send(new GetQueueAttributesCommand({ 
      QueueUrl: queueUrl, 
      AttributeNames: ['All'] 
    }));
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
}
