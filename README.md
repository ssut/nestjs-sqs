# nestjs-sqs

![Test](https://github.com/ssut/nestjs-sqs/workflows/Test/badge.svg)
[![npm version](https://badge.fury.io/js/%40ssut%2Fnestjs-sqs.svg)](https://badge.fury.io/js/%40ssut%2Fnestjs-sqs)

Tested with: [AWS SQS](https://aws.amazon.com/en/sqs/) and [ElasticMQ](https://github.com/softwaremill/elasticmq).

Nestjs-sqs is a project to make SQS easier to use and control some required flows with NestJS.
This module provides decorator-based message handling suited for simple use.

This library internally uses [bbc/sqs-producer](https://github.com/bbc/sqs-producer) and [bbc/sqs-consumer](https://github.com/bbc/sqs-consumer), and implements some more useful features on top of the basic functionality given by them.

## Installation

```shell script
$ npm i --save @ssut/nestjs-sqs
```

## Quick Start

Just register this module:

```ts
@Module({
  imports: [
    SqsModule.register({
      consumers: [],
      producers: [],
    }),
  ],
})
class AppModule {}
```

Quite often you might want to asynchronously pass module options instead of passing them beforehand.
In such case, use `registerAsync()` method like many other Nest.js libraries.

- Use factory

```ts
SqsModule.registerAsync({
  useFactory: () => {
    return {
      consumers: [],
      producers: [],         
    };
  },
});
```

- Use class

```ts
SqsModule.registerAsync({
  useClass: SqsConfigService,
});
```

- Use existing

```ts
SqsModule.registerAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});
```

### Configuration

See [here](https://github.com/ssut/nestjs-sqs/blob/master/lib/sqs.types.ts), and note that we have same configuration as [bbc/sqs-consumer's](https://github.com/bbc/sqs-producer). 
In most time you just need to specify both `name` and `queueUrl` at the minimum requirements.

## License

This project is licensed under the terms of the MIT license.
