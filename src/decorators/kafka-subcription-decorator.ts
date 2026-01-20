import "reflect-metadata";
import { KafkaSubscriptionMeta } from "../interfaces/kafka-option.interface";
import { KAFKA_SUBSCRIPTION_METADATA } from "../constants/kafka.constants";

/**
 * Method Decorator to mark a method as a Kafka message handler for a specific topic.
 * The decorated method MUST be async and accept arguments: (payload: T, topic: string, partition: number).
 * The message.value will be automatically parsed from JSON.
 *
 * @param topic The Kafka topic to subscribe to. Must be a non-empty string.
 * @throws {Error} If the topic is empty or invalid
 * @throws {Error} If the decorator is used on a non-method property
 * @throws {Error} If the decorator is used on a symbol property
 */
export function KafkaSubscribe(topic: string): MethodDecorator {
  if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
    throw new Error("Topic must be a non-empty string");
  }

  return (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    if (typeof propertyKey === "symbol") {
      throw new Error(
        "KafkaSubscribe decorator cannot be used on symbol properties",
      );
    }

    if (!descriptor || typeof descriptor.value !== "function") {
      throw new Error("KafkaSubscribe decorator can only be used on methods");
    }

    const originalMethod = descriptor.value;
    if (originalMethod.length !== 3) {
      throw new Error(
        "KafkaSubscribe handler must accept exactly 3 parameters: payload, topic, and partition",
      );
    }

    const metadata: KafkaSubscriptionMeta = {
      topic,
      methodName: propertyKey as string,
    };

    Reflect.defineMetadata(
      KAFKA_SUBSCRIPTION_METADATA,
      metadata,
      target,
      propertyKey,
    );

    return descriptor;
  };
}
