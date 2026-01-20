import { logLevel } from "kafkajs";

// Injection token for Kafka module options
export const KAFKA_OPTIONS = Symbol("KAFKA_OPTIONS");

//Metadata key used to store subscription information via reflection
export const KAFKA_SUBSCRIPTION_METADATA = Symbol(
  "kafka_subscription_metadata",
);

//Supported cloud providers for Kafka configuration
export enum KafkaCloudProvider {
  AWS = "aws",
  AZURE = "azure",
  LOCAL = "local",
}

// Default values for Kafka configuration
export const KAFKA_DEFAULTS = {
  CLOUD_PROVIDER: KafkaCloudProvider.LOCAL,
  LOG_LEVEL: logLevel.INFO,
  SSL: false,
  FROM_BEGINNING: false,
  ALLOW_AUTO_TOPIC_CREATION: true,
} as const;
