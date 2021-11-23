import { MessageAttributeValue, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
// import { SendMessageBatchRequestEntry } from 'aws-sdk/clients/sqs';
import { isObject, isString, isMessageAttributeValid } from './validation'

export type MessageBodyAttributeMap = {
    [key: string]: MessageAttributeValue;
};

export interface Message {
    id: string;
    body: string;
    groupId?: string;
    deduplicationId?: string;
    delaySeconds?: number;
    messageAttributes?: MessageBodyAttributeMap;
}

function entryFromObject(message: Message): SendMessageBatchRequestEntry {
    if (!message.body) {
        throw new Error(`Object messages must have 'body' prop`);
    }

    if (!message.groupId && !message.deduplicationId && !message.id) {
        throw new Error(`Object messages must have 'id' prop`);
    }

    if (message.deduplicationId && !message.groupId) {
        throw new Error(`FIFO Queue messages must have 'groupId' prop`);
    }

    if (message.id) {
        if (!isString(message.id)) {
            throw new Error('Message.id value must be a string');
        }
    }

    const entry: SendMessageBatchRequestEntry = {
        Id: message.id,
        MessageBody: message.body
    };

    if (message.delaySeconds) {
        if ((typeof message.delaySeconds !== 'number') ||
            (message.delaySeconds < 0 || message.delaySeconds > 900)) {
            throw new Error('Message.delaySeconds value must be a number contained within [0 - 900]');
        }

        entry.DelaySeconds = message.delaySeconds;
    }

    if (message.messageAttributes) {
        if (!isObject(message.messageAttributes)) {
            throw new Error('Message.messageAttributes must be an object');
        }

        Object.values(message.messageAttributes).every(isMessageAttributeValid);

        entry.MessageAttributes = message.messageAttributes;
    }

    if (message.groupId) {
        if (!isString(message.groupId)) {
            throw new Error('Message.groupId value must be a string');
        }

        entry.MessageGroupId = message.groupId;
    }

    if (message.deduplicationId) {
        if (!isString(message.deduplicationId)) {
            throw new Error('Message.deduplicationId value must be a string');
        }

        entry.MessageDeduplicationId = message.deduplicationId;
    }

    return entry;
}

function entryFromString(message: string): SendMessageBatchRequestEntry {
    return {
        Id: message,
        MessageBody: message
    };
}

export function toEntry(message: string | Message): SendMessageBatchRequestEntry {
    if (isString(message)) { return entryFromString(<string>message); }
    if (isObject(message)) { return entryFromObject(<Message>message); }

    throw new Error('A message can either be an object or a string');
}
