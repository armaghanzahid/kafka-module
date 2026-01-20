import { z } from "zod";
import { SASLOptions } from "kafkajs";
import {
  KafkaCloudProvider,
  KAFKA_DEFAULTS,
} from "./constants/kafka.constants";

const SASLOptionsZ = z.object({
  mechanism: z.string(),
  username: z.string().optional(),
  password: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  authorizationIdentity: z.string().optional(),
  sessionToken: z.string().optional(),
}) as z.ZodType<SASLOptions>;

/**
 * Schema for environment variables validation
 */
export const EnvSchema = z
  .object({
    KAFKA_CLOUD_PROVIDER: z
      .nativeEnum(KafkaCloudProvider)
      .default(KafkaCloudProvider.LOCAL),
    KAFKA_CLIENT_ID: z.string().default("default-client"),
    KAFKA_BROKERS: z.string().nonempty("KAFKA_BROKERS is required"),
    KAFKA_GROUP_ID: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_SESSION_TOKEN: z.string().optional(),
    AWS_ROLE_ARN: z.string().optional(),
    AWS_REGION: z.string().optional(),
    AZURE_EVENT_HUB_CONNECTION_STRING: z.string().optional(),
    KAFKA_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .refine((n) => !isNaN(n), { message: "must be a valid number" })
      .optional(),
    KAFKA_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .refine((n) => !isNaN(n), { message: "must be a valid number" })
      .optional(),
  })
  .refine(
    (data) => {
      if (data.KAFKA_CLOUD_PROVIDER === KafkaCloudProvider.AWS) {
        return !!data.AWS_ACCESS_KEY_ID && !!data.AWS_SECRET_ACCESS_KEY;
      }
      return true;
    },
    {
      message:
        "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for AWS MSK",
      path: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    },
  )
  .refine(
    (data) => {
      if (data.KAFKA_CLOUD_PROVIDER === KafkaCloudProvider.AZURE) {
        return !!data.AZURE_EVENT_HUB_CONNECTION_STRING;
      }
      return true;
    },
    {
      message:
        "AZURE_EVENT_HUB_CONNECTION_STRING is required for Azure Event Hubs",
      path: ["AZURE_EVENT_HUB_CONNECTION_STRING"],
    },
  );

/**
 * Zod schema for validating Kafka module options
 * This serves as the single source of truth for Kafka configuration validation
 */
export const KafkaOptionsZ = z.object({
  client: z.object({
    clientId: z.string(),
    brokers: z.array(z.string()).min(1, "At least one broker is required"),
    ssl: z.boolean().default(KAFKA_DEFAULTS.SSL),
    logLevel: z.number().default(KAFKA_DEFAULTS.LOG_LEVEL),
    sasl: SASLOptionsZ.optional(),
    connectionTimeout: z.number().optional(),
    requestTimeout: z.number().optional(),
  }),
  consumer: z
    .object({
      groupId: z.string(),
      fromBeginning: z.boolean().default(KAFKA_DEFAULTS.FROM_BEGINNING),
    })
    .optional(),
  producer: z
    .object({
      allowAutoTopicCreation: z
        .boolean()
        .default(KAFKA_DEFAULTS.ALLOW_AUTO_TOPIC_CREATION),
      transactionTimeout: z.number().optional(),
      idempotent: z.boolean().optional(),
    })
    .optional(),
  cloudProvider: z
    .nativeEnum(KafkaCloudProvider)
    .default(KAFKA_DEFAULTS.CLOUD_PROVIDER),
  onMessageError: z
    .function()
    .args(
      z.instanceof(Error),
      z.object({
        topic: z.string(),
        partition: z.number(),
        message: z.any(),
      }),
    )
    .returns(z.promise(z.void()))
    .optional(),
});

// Export the inferred TypeScript types
export type KafkaModuleOptions = z.infer<typeof KafkaOptionsZ>;
