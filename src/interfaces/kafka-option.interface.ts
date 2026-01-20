import {
  KafkaConfig,
  ConsumerConfig,
  ProducerConfig,
  KafkaMessage,
} from "kafkajs";
import { KafkaCloudProvider } from "../constants/kafka.constants";

export type CloudProvider = "aws" | "azure" | "local";

//Options for configuring the KafkaModule
export interface KafkaModuleOptions {
  //KafkaJS client configuration
  client: KafkaConfig;
  //Consumer specific configuration
  consumer?: ConsumerConfig & {
    fromBeginning?: boolean;
  };
  //Producer specific configuration
  producer?: ProducerConfig;
  //Cloud provider for automatic SSL/SASL setup
  cloudProvider?: KafkaCloudProvider;
  //Optional error handler for message processing errors
  onMessageError?: (
    error: Error,
    context: { topic: string; partition: number; message: KafkaMessage },
  ) => Promise<void>;
}

//Metadata for Kafka topic subscriptions

export interface KafkaSubscriptionMeta {
  topic: string;
  methodName: string;
}

export type KafkaHandlerFunction<T = unknown> = (
  payload: T,
  topic: string,
  partition: number,
) => Promise<void>;
