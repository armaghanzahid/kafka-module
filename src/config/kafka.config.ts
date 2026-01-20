import { Logger } from "@nestjs/common";
import { parseConnectionString } from "@azure/core-amqp";
import { SASLOptions, logLevel } from "kafkajs";
import { KafkaOptionsZ, KafkaModuleOptions, EnvSchema } from "../schema";
import { KafkaCloudProvider } from "../constants/kafka.constants";

interface EventHubConnectionString {
  Endpoint: string;
  SharedAccessKeyName: string;
  SharedAccessKey: string;
  EntityPath?: string;
}

export class KafkaConfig {
  private static readonly logger = new Logger(KafkaConfig.name);

  static getConfig(): KafkaModuleOptions {
    // Parse and validate environment variables
    const env = EnvSchema.parse(process.env);

    const config: KafkaModuleOptions = {
      client: {
        clientId: env.KAFKA_CLIENT_ID,
        brokers: env.KAFKA_BROKERS.split(",").map((s) => s.trim()),
        ssl: false, // Default to false, will be overridden for cloud providers
        logLevel: logLevel.INFO,
        ...(env.KAFKA_CONNECTION_TIMEOUT_MS && {
          connectionTimeout: env.KAFKA_CONNECTION_TIMEOUT_MS,
        }),
        ...(env.KAFKA_REQUEST_TIMEOUT_MS && {
          requestTimeout: env.KAFKA_REQUEST_TIMEOUT_MS,
        }),
      },
      consumer: env.KAFKA_GROUP_ID
        ? { groupId: env.KAFKA_GROUP_ID, fromBeginning: false }
        : undefined,
      cloudProvider: env.KAFKA_CLOUD_PROVIDER,
    };

    // AWS MSK Configuration
    if (env.KAFKA_CLOUD_PROVIDER === KafkaCloudProvider.AWS) {
      config.client.ssl = true;

      // Build SASL configuration with required authorizationIdentity
      const sasl: SASLOptions = {
        mechanism: "aws",
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
        authorizationIdentity: env.AWS_ROLE_ARN || "", // Required by type for AWS mechanism
        ...(env.AWS_SESSION_TOKEN && { sessionToken: env.AWS_SESSION_TOKEN }),
      };

      // Set region if provided
      if (env.AWS_REGION) {
        (config.client as any).region = env.AWS_REGION;
      }

      config.client.sasl = sasl;
      this.logger.log("Configured AWS MSK with IAM authentication");
    }

    // Azure Event Hubs Configuration
    if (env.KAFKA_CLOUD_PROVIDER === KafkaCloudProvider.AZURE) {
      config.client.ssl = true;
      const connectionString = env.AZURE_EVENT_HUB_CONNECTION_STRING!;

      try {
        const parsed = parseConnectionString(
          connectionString,
        ) as EventHubConnectionString;
        if (!parsed.SharedAccessKeyName || !parsed.SharedAccessKey) {
          throw new Error(
            "Connection string is missing required SharedAccessKeyName or SharedAccessKey",
          );
        }

        config.client.sasl = {
          mechanism: "plain",
          username: parsed.SharedAccessKeyName,
          password: parsed.SharedAccessKey,
        };
        this.logger.log("Configured for Azure Event Hubs");
      } catch (error) {
        throw new Error(
          `Failed to parse Azure Event Hub connection string: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Local configuration (default)
    if (env.KAFKA_CLOUD_PROVIDER === KafkaCloudProvider.LOCAL) {
      config.client.ssl = false;
      this.logger.log("Configured for local Kafka");
    }

    // Validate the final configuration against our schema
    const result = KafkaOptionsZ.safeParse(config);
    if (!result.success) {
      throw new Error(
        `Invalid Kafka configuration:\n${result.error.errors.map((e) => e.message).join("\n")}`,
      );
    }

    return result.data;
  }
}
