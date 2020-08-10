import type { ConsumerOptions } from 'sqs-consumer';
import type { Producer } from 'sqs-producer';
import type { SQS } from 'aws-sdk';
import type { ModuleMetadata, Type } from '@nestjs/common';

export type ProducerOptions = Parameters<typeof Producer.create>[0];
export type QueueName = string;

export type SqsConsumerOptions = Omit<ConsumerOptions, 'handleMessage' | 'handleMessageBatch'> & {
  name: QueueName;
};

export type SqsProducerOptions = ProducerOptions & {
  name: QueueName;
};

export interface SqsOptions {
  consumers?: SqsConsumerOptions[];
  producers?: SqsProducerOptions[];
};

export interface SqsModuleOptionsFactory {
  createOptions(): Promise<SqsOptions> | SqsOptions;
}

export interface SqsModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<SqsModuleOptionsFactory>;
  useClass?: Type<SqsModuleOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<SqsOptions> | SqsOptions;
  inject?: any[];
}

export interface Message {
  id: string;
  body: any;
  groupId?: string;
  deduplicationId?: string;
  delaySeconds?: number;
  messageAttributes?: SQS.MessageBodyAttributeMap;
}

export interface SqsMessageHandlerMeta {
  name: string;
  batch?: boolean;
}

export interface SqsConsumerEventHandlerMeta {
  name: string;
  eventName: string;
}

