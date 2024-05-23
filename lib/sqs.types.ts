import type { Consumer, ConsumerOptions, StopOptions } from 'sqs-consumer';
import type { Producer } from 'sqs-producer';
import type { LoggerService, ModuleMetadata, Type } from '@nestjs/common';
import type { MessageAttributeValue } from '@aws-sdk/client-sqs';

export type ProducerOptions = Parameters<typeof Producer.create>[0];
export type QueueName = string;

export type SqsConsumerOptions = Omit<ConsumerOptions, 'handleMessage' | 'handleMessageBatch'> & {
  name: QueueName;
  stopOptions?: StopOptions;
};

export type SqsConsumerMapValues = {
  instance: Consumer;
  stopOptions: StopOptions;
};

export type SqsProducerOptions = ProducerOptions & {
  name: QueueName;
};

export type GlobalOptions = {
  endpoint?: string;
};

export interface SqsOptions {
  globalOptions?: GlobalOptions;
  consumers?: SqsConsumerOptions[];
  producers?: SqsProducerOptions[];
  logger?: LoggerService;
  globalStopOptions?: StopOptions;
}

export interface SqsModuleOptionsFactory {
  createOptions(): Promise<SqsOptions> | SqsOptions;
}

export interface SqsModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<SqsModuleOptionsFactory>;
  useClass?: Type<SqsModuleOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<SqsOptions> | SqsOptions;
  inject?: any[];
}

export interface Message<T = any> {
  id: string;
  body: T;
  groupId?: string;
  deduplicationId?: string;
  delaySeconds?: number;
  messageAttributes?: Record<string, MessageAttributeValue>;
}

export interface SqsMessageHandlerMeta {
  name: string;
  batch?: boolean;
}

export interface SqsConsumerEventHandlerMeta {
  name: string;
  eventName: string;
}
