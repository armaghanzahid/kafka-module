import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  OnApplicationBootstrap,
  Logger,
  Inject,
} from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Kafka, Consumer, Producer, logLevel } from "kafkajs";
import {
  KafkaModuleOptions,
  KafkaHandlerFunction,
} from "./interfaces/kafka-option.interface";
import {
  KAFKA_OPTIONS,
  KAFKA_SUBSCRIPTION_METADATA,
} from "./constants/kafka.constants";

@Injectable()
export class KafkaService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private readonly consumer: Consumer | null = null;
  private readonly logger = new Logger(KafkaService.name);
  private readonly subscribeFromBeginning: boolean = false;
  private connected = false;
  private processingStarted = false;
  private readonly handlers = new Map<string, KafkaHandlerFunction>();

  constructor(
    @Inject(KAFKA_OPTIONS)
    private readonly options: KafkaModuleOptions,
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {
    // --- Kafka Client Configuration ---
    const baseConfig = {
      ...this.options.client,
      logLevel: this.options.client.logLevel ?? logLevel.INFO,
    };

    // Auto-enable SSL based on cloudProvider hint
    if (
      this.options.cloudProvider &&
      this.options.cloudProvider !== "local" &&
      baseConfig.ssl === undefined
    ) {
      baseConfig.ssl = true;
      this.logger.log(
        `Enabled SSL based on cloudProvider: ${this.options.cloudProvider}`,
      );
    }

    this.kafka = new Kafka(baseConfig);

    // --- Producer ---
    this.producer = this.kafka.producer(this.options.producer ?? {});

    // --- Consumer ---
    if (this.options.consumer?.groupId) {
      this.consumer = this.kafka.consumer(this.options.consumer);
      this.subscribeFromBeginning =
        this.options.consumer.fromBeginning ?? false;
      this.logger.log(
        `Consumer configured (groupId=${this.options.consumer.groupId})`,
      );
    } else {
      this.logger.log(
        "No consumer.groupId provided; running in producer-only mode.",
      );
    }
  }

  //Discover and register handlers before bootstrap
  async onModuleInit(): Promise<void> {
    if (!this.consumer) return;
    this.logger.log("Discovering Kafka handlers...");
    this.findHandlers();
    this.logger.log(
      `Registered ${this.handlers.size} handler(s) for processing.`,
    );
  }

  private findHandlers(): void {
    const providers = this.discoveryService.getProviders();
    const controllers = this.discoveryService.getControllers();
    [...providers, ...controllers]
      .filter((w) => w.instance)
      .forEach((wrapper) => {
        const instance = wrapper.instance as Record<string, any>;
        const prototype = Object.getPrototypeOf(instance);
        this.metadataScanner
          .getAllMethodNames(prototype)
          .forEach((methodName) => {
            const meta = this.reflector.get(
              KAFKA_SUBSCRIPTION_METADATA,
              instance[methodName],
            );
            if (!meta) return;
            const handler = instance[methodName].bind(
              instance,
            ) as KafkaHandlerFunction;
            if (this.handlers.has(meta.topic)) {
              this.logger.warn(`Overwriting handler for topic "${meta.topic}"`);
            }
            this.handlers.set(meta.topic, handler);
            this.logger.log(
              `Mapped topic "${meta.topic}" to ${wrapper.name}.${methodName}`,
            );
          });
      });
  }

  //Connect producer and consumer once
  private async connect(): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    try {
      this.logger.log("Connecting producer...");
      await this.producer.connect();
      this.logger.log("Producer connected.");

      if (this.consumer) {
        this.logger.log("Connecting consumer...");
        await this.consumer.connect();
        this.logger.log("Consumer connected.");
      }
    } catch (err) {
      this.logger.error(
        "Connection failed",
        err instanceof Error ? err.stack : err,
      );
      throw err;
    }
  }

  //Subscribe and start message loop
  private async startConsumerProcessing(): Promise<void> {
    if (!this.consumer) return;
    if (this.processingStarted) return;
    this.processingStarted = true;

    try {
      // Subscribe to each topic individually
      for (const topic of this.handlers.keys()) {
        await this.consumer.subscribe({
          topic,
          fromBeginning: this.subscribeFromBeginning,
        });
      }
      this.logger.log(
        `Subscribed to topics: [${[...this.handlers.keys()].join(", ")}] (fromBeginning=${this.subscribeFromBeginning})`,
      );

      // Run the consumer loop
      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const handler = this.handlers.get(topic);
          if (!handler) return;

          const start = Date.now();
          this.logger.debug(
            `Recv message t:${topic} p:${partition} o:${message.offset}`,
          );

          // 1) Parse JSON
          let payload: unknown;
          try {
            payload = JSON.parse(message.value?.toString() ?? "");
          } catch (err) {
            this.logger.error(
              `JSON parse failed on ${topic}[${partition}]`,
              err,
            );
            if (this.options.onMessageError) {
              await this.options.onMessageError(err as Error, {
                topic,
                partition,
                message,
              });
            }
            return;
          }

          // 2) Invoke handler
          try {
            await handler(payload, topic, partition);
            this.logger.debug(
              `Processed ${topic}[${partition}] in ${Date.now() - start}ms`,
            );
          } catch (err) {
            this.logger.error(`Handler error on ${topic}[${partition}]`, err);
            if (this.options.onMessageError) {
              await this.options.onMessageError(err as Error, {
                topic,
                partition,
                message,
              });
            }
          }
        },
      });
      this.logger.log("Consumer processing loop started.");
    } catch (err) {
      this.logger.error(
        "Failed to start consumer loop",
        err instanceof Error ? err.stack : err,
      );
    }
  }

  //Called after all modules are up
  async onApplicationBootstrap(): Promise<void> {
    await this.connect();
    if (this.consumer && this.handlers.size > 0) {
      await this.startConsumerProcessing();
    } else if (this.consumer) {
      this.logger.warn(
        "Consumer configured but no handlers found; skipping processing.",
      );
    }
  }

  //Publish a message
  async publish<T extends string | Buffer | Record<string, any>>(
    topic: string,
    value: T,
    key?: string | Buffer,
    headers?: Record<string, string | Buffer | undefined>,
  ) {
    const payload = {
      key,
      value: Buffer.isBuffer(value)
        ? value
        : typeof value === "string"
          ? value
          : JSON.stringify(value),
      headers,
    };
    try {
      this.logger.debug(`Publishing message to ${topic}`);
      await this.producer.send({ topic, messages: [payload] });
    } catch (err) {
      this.logger.error(
        `Failed to publish to ${topic}`,
        err instanceof Error ? err.stack : err,
      );
      throw err;
    }
  }

  //Disconnect on shutdown
  async onModuleDestroy(): Promise<void> {
    this.logger.log("Disconnecting Kafka clients...");
    try {
      if (this.consumer) {
        await this.consumer.disconnect();
        this.logger.log("Consumer disconnected.");
      }
      await this.producer.disconnect();
      this.logger.log("Producer disconnected.");
    } catch (err) {
      this.logger.error(
        "Error during disconnect",
        err instanceof Error ? err.stack : err,
      );
    }
  }

  getKafkaClient(): Kafka {
    return this.kafka;
  }

  getProducer(): Producer {
    return this.producer;
  }

  getConsumer(): Consumer | null {
    return this.consumer;
  }
}
