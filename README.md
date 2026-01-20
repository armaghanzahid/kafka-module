# Kafka Module for NestJS [npm package](https://www.npmjs.com/package/@armaghanzahid/kafka-module)

A robust Kafka module for NestJS applications that provides type-safe message handling, automatic JSON parsing, and cloud provider support.

## Features

- Type-safe message handling with automatic JSON parsing
- Support for AWS MSK, Azure Event Hubs, and local Kafka
- Automatic SSL/SASL configuration based on cloud provider
- Decorator-based topic subscription
- Configurable error handling
- Environment-based configuration
- Zod schema validation for all configurations

## Installation

```bash
npm install @armaghanzahid/kafka-module
# or
yarn add @armaghanzahid/kafka-module
```

## Module Usage

### Basic Module Registration

```typescript
import { KafkaModule } from "@your-org/kafka-module";

@Module({
  imports: [
    KafkaModule.register({
      client: {
        clientId: "my-app",
        brokers: ["kafka:9092"],
      },
      consumer: {
        groupId: "my-group",
      },
    }),
  ],
})
export class AppModule {}
```

### Async Module Registration

```typescript
import { KafkaModule } from "@your-org/kafka-module";
import { ConfigService } from "@nestjs/config";

@Module({
  imports: [
    KafkaModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        client: {
          clientId: configService.get("KAFKA_CLIENT_ID"),
          brokers: configService.get("KAFKA_BROKERS").split(","),
        },
        consumer: {
          groupId: configService.get("KAFKA_GROUP_ID"),
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

## Message Handling

### How the KafkaSubscribe Decorator Works

The `@KafkaSubscribe` decorator uses TypeScript's metadata reflection to register message handlers. Here's how it works:

1. **Metadata Registration**

   ```typescript
   @KafkaSubscribe<MyMessage>('my-topic')
   async handleMessage(payload: MyMessage, topic: string, partition: number) {
     // Handler implementation
   }
   ```
   - The decorator stores the topic and method name in the class metadata
   - The generic type parameter `<MyMessage>` defines the expected payload type
   - The method signature is validated at runtime

2. **Handler Discovery**
   - During module initialization, the service scans for classes with `@KafkaSubscribe` decorators
   - Each decorated method is registered as a handler for its specified topic
   - The service maintains a map of topics to their handlers

3. **Message Processing**
   - When a message arrives, the service:
     1. Parses the message value as JSON
     2. Validates the payload against the handler's type
     3. Calls the handler with the parsed payload
     4. Handles any errors that occur

4. **Type Safety**

   ```typescript
   // The decorator ensures type safety through generics
   @KafkaSubscribe<MyMessage>('my-topic')
   async handleMessage(payload: MyMessage, topic: string, partition: number) {
     // TypeScript knows the shape of 'payload'
     console.log(payload.id); // OK
     console.log(payload.unknown); // TypeScript error
   }
   ```

5. **Error Handling**
   - The decorator validates the method signature at runtime
   - Throws errors if:
     - The topic is empty or invalid
     - The method doesn't accept exactly 3 parameters
     - The method is not async
     - The decorator is used on a non-method property

### Using the KafkaSubscribe Decorator

The `@KafkaSubscribe` decorator marks a method as a Kafka message handler. The decorated method must:

- Be async
- Accept exactly 3 parameters: payload, topic, and partition
- Have a generic type parameter for the message payload

```typescript
import { KafkaSubscribe } from "@your-org/kafka-module";
import { Injectable } from "@nestjs/common";

// Define your message type
interface MyMessage {
  id: string;
  data: string;
}

@Injectable()
export class MyService {
  @KafkaSubscribe<MyMessage>("my-topic")
  async handleMessage(payload: MyMessage, topic: string, partition: number) {
    console.log(`Received message:`, payload);
  }
}
```

### Real-World Example

Here's a practical example showing type-safe message handling with DTOs:

```typescript
import { KafkaSubscribe } from "@your-org/kafka-module";
import { Injectable } from "@nestjs/common";

// Define your topics enum
enum MedicalRecordTopics {
  RECEPTION_UPLOAD = "medical.records.reception.upload",
  PATIENT_UPDATE = "medical.records.patient.update",
}

// Define your DTO
interface UploadReceptionDto {
  patientId: string;
  recordType: string;
  fileUrl: string;
  uploadedBy: string;
  timestamp: Date;
}

@Injectable()
export class MedicalRecordsService {
  @KafkaSubscribe<UploadReceptionDto>(MedicalRecordTopics.RECEPTION_UPLOAD)
  async handleReceptionUpload(
    reception: UploadReceptionDto, // <-- automatically parsed payload
    topic: string,
    partition: number,
  ) {
    // No JSON.parse needed - service handles parsing
    if (this.consumer) {
      await this.consumer.onReceptionUpload(reception);
    }
  }
}
```

### Error Handling in Handlers

```typescript
@KafkaSubscribe<MyMessage>('my-topic')
async handleMessage(payload: MyMessage, topic: string, partition: number) {
  try {
    // Process message
    await this.processMessage(payload);
  } catch (error) {
    // Handle error
    this.logger.error(`Failed to process message on ${topic}[${partition}]`, error);
    throw error; // Will be caught by the module's error handler
  }
}
```

## KafkaService

The `KafkaService` provides methods for interacting with Kafka.

### Publishing Messages

```typescript
import { KafkaService } from "@your-org/kafka-module";
import { Injectable } from "@nestjs/common";

@Injectable()
export class MyService {
  constructor(private readonly kafkaService: KafkaService) {}

  async publishMessage() {
    // Publish with payload only
    await this.kafkaService.publish("my-topic", { id: "1", data: "test" });

    // Publish with key and headers
    await this.kafkaService.publish("my-topic", { id: "1", data: "test" }, "message-key", {
      "custom-header": "value",
    });
  }
}
```

### Accessing Kafka Clients

```typescript
@Injectable()
export class MyService {
  constructor(private readonly kafkaService: KafkaService) {}

  async getKafkaInfo() {
    const kafka = this.kafkaService.getKafkaClient();
    const producer = this.kafkaService.getProducer();
    const consumer = this.kafkaService.getConsumer();
  }
}
```

## Configuration

### Required Configuration

```typescript
interface KafkaModuleOptions {
  client: {
    clientId: string; // Required: Unique identifier for the client
    brokers: string[]; // Required: At least one broker address
  };
  consumer?: {
    groupId: string; // Required if using consumer
  };
}
```

### Optional Configuration

```typescript
interface KafkaModuleOptions {
  client: {
    ssl?: boolean; // Default: false
    logLevel?: number; // Default: INFO (4)
    sasl?: SASLOptions; // Optional: SASL configuration
    connectionTimeout?: number; // Optional: Connection timeout in ms
    requestTimeout?: number; // Optional: Request timeout in ms
  };
  consumer?: {
    fromBeginning?: boolean; // Default: false
  };
  producer?: {
    allowAutoTopicCreation?: boolean; // Default: true
    transactionTimeout?: number; // Optional: Transaction timeout in ms
    idempotent?: boolean; // Optional: Enable idempotent producer
  };
  cloudProvider?: "aws" | "azure" | "local"; // Default: 'local'
  onMessageError?: (
    error: Error,
    context: { topic: string; partition: number; message: any },
  ) => Promise<void>;
}
```

### Cloud Provider Configuration

#### AWS MSK

```typescript
KafkaModule.register({
  client: {
    clientId: "my-app",
    brokers: ["your-msk-endpoint:9092"],
  },
  cloudProvider: "aws",
});
```

Required environment variables:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (optional)
- `AWS_SESSION_TOKEN` (optional)
- `AWS_ROLE_ARN` (optional)

#### Azure Event Hubs

```typescript
KafkaModule.register({
  client: {
    clientId: "my-app",
    brokers: ["your-eventhub-endpoint:9093"],
  },
  cloudProvider: "azure",
});
```

Required environment variable:

- `AZURE_EVENT_HUB_CONNECTION_STRING`

## Environment Variables

The module can be configured using environment variables:

```env
# Required
KAFKA_CLIENT_ID=my-app
KAFKA_BROKERS=kafka:9092

# Optional
KAFKA_CLOUD_PROVIDER=local|aws|azure
KAFKA_GROUP_ID=my-group
KAFKA_CONNECTION_TIMEOUT_MS=3000
KAFKA_REQUEST_TIMEOUT_MS=30000

# AWS specific
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=your-region
AWS_SESSION_TOKEN=your-session-token
AWS_ROLE_ARN=your-role-arn

# Azure specific
AZURE_EVENT_HUB_CONNECTION_STRING=your-connection-string
```

## Best Practices

1. **Type Safety**
   - Always define message types for type-safe handling
   - Use interfaces or types for message payloads
   - Leverage TypeScript's type inference

2. **Configuration**
   - Use environment variables for configuration
   - Validate configuration using the provided Zod schema
   - Set appropriate timeouts for your use case

3. **Error Handling**
   - Implement proper error handling in message handlers
   - Use the `onMessageError` callback for global error handling
   - Log errors with appropriate context

4. **Cloud Integration**
   - Use appropriate cloud provider settings
   - Configure SSL/SASL based on your environment
   - Follow cloud provider best practices

5. **Performance**
   - Configure appropriate batch sizes
   - Set reasonable timeouts
   - Monitor consumer lag

## Contributing

Contributions are welcome! Please read our contributing guidelines.

## License

MIT
