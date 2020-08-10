import { QueueName } from './sqs.types';
import { SetMetadata } from '@nestjs/common';
import { SQS_CONSUMER_EVENT_HANDLER, SQS_CONSUMER_METHOD } from './sqs.constants';

type Fn = (...args: any[]) => void;
type Handler = (...args: any[]) => Promise<void>;

type Metadata = {
  handler?: Handler;
  batchHandler?: Handler;
  eventHandlers: Map<string, Fn[]>;
};

export const CONSUMER_REF_MAP = new Map<QueueName, Metadata>();

export const getMetadata = (name: QueueName) => {
  if (CONSUMER_REF_MAP.has(name)) {
    return CONSUMER_REF_MAP.get(name);
  }

  const metadata: Metadata = Object.seal({
    handler: undefined,
    batchHandler: undefined,
    eventHandlers: new Map(),
  });
  CONSUMER_REF_MAP.set(name, metadata);
  return metadata;
};

export const SqsMessageHandler = (name: string, batch?: boolean) => SetMetadata(SQS_CONSUMER_METHOD, { name, batch });
export const SqsConsumerEventHandler = (name: string, eventName: string) => SetMetadata(SQS_CONSUMER_EVENT_HANDLER, { name, eventName });


//
// export function SqsMessageHandler(name: string, batch?: boolean): MethodDecorator {
//   return (target, propertyKey, descriptor) => {
//     const originalMethod = Reflect.get(target, propertyKey);
//     const metadata = getMetadata(name);
//     if (typeof metadata.handler === 'function' ||typeof metadata.batchHandler === 'function') {
//       throw new Error('Handler is already set');
//     }
//     if (batch) {
//       metadata.batchHandler = originalMethod;
//     } else {
//       metadata.handler = originalMethod;
//     }
//
//     return descriptor;
//   };
// }
//
// export function SqsConsumerEventHandler(name: string, eventName: string): MethodDecorator {
//   return (target, propertyKey, descriptor) => {
//     const originalMethod = Reflect.get(target, propertyKey);
//     const metadata = getMetadata(name);
//     metadata.eventHandlers.set(
//       eventName,
//       [...(metadata.eventHandlers.get(eventName) ?? []), originalMethod],
//     );
//
//     return descriptor;
//   };
// }
