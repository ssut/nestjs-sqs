import type { ModuleMetadata, Type } from '@nestjs/common';
import { ConsumerOptions } from './sqs-consumer';
import { Producer } from './sqs-producer';
import { MessageBodyAttributeMap } from './sqs-producer/types';

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

export interface Message<T = any> {
  id: string;
  body: T;
  groupId?: string;
  deduplicationId?: string;
  delaySeconds?: number;
  messageAttributes?: MessageBodyAttributeMap;
}

export interface SqsMessageHandlerMeta {
  name: string;
  batch?: boolean;
}

export interface SqsConsumerEventHandlerMeta {
  name: string;
  eventName: string;
}

