import { Module, DynamicModule, Global, Provider, Type } from "@nestjs/common";
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
  Reflector,
} from "@nestjs/core";
import { KafkaService } from "./kafka.service";
import { KAFKA_OPTIONS } from "./constants/kafka.constants";
import { KafkaOptionsZ, KafkaModuleOptions } from "./schema";

//Async options for configuring the KafkaModule
export interface KafkaModuleAsyncOptions {
  imports?: Type<any>[];
  useFactory: (
    ...args: unknown[]
  ) => Promise<KafkaModuleOptions> | KafkaModuleOptions;
  inject?: (string | symbol | Type<any>)[];
}

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [DiscoveryService, MetadataScanner, Reflector],
})
export class KafkaModule {
  //Registers the KafkaModule dynamically with specific options.
  static register(options: KafkaModuleOptions): DynamicModule {
    // Validate and apply defaults via Zod schema
    const result = KafkaOptionsZ.safeParse(options);
    if (!result.success) {
      throw new Error(
        `Invalid KafkaModule options:\n${result.error.errors.map((e) => e.message).join("\n")}`,
      );
    }

    const kafkaOptionsProvider: Provider = {
      provide: KAFKA_OPTIONS,
      useValue: result.data,
    };

    const kafkaServiceProvider: Provider = {
      provide: KafkaService,
      useFactory: (
        cfg: KafkaModuleOptions,
        discovery: DiscoveryService,
        scanner: MetadataScanner,
        reflector: Reflector,
      ) => new KafkaService(cfg, discovery, scanner, reflector),
      inject: [KAFKA_OPTIONS, DiscoveryService, MetadataScanner, Reflector],
    };

    return {
      module: KafkaModule,
      providers: [kafkaOptionsProvider, kafkaServiceProvider],
      exports: [KafkaService],
    };
  }

  //Registers the KafkaModule asynchronously with factory-generated options.
  static registerAsync(options: KafkaModuleAsyncOptions): DynamicModule {
    const asyncOptionsProvider: Provider = {
      provide: KAFKA_OPTIONS,
      useFactory: async (...args: unknown[]) => {
        const raw = (await options.useFactory(...args)) as KafkaModuleOptions;
        const result = KafkaOptionsZ.safeParse(raw);
        if (!result.success) {
          throw new Error(
            `Invalid KafkaModule options (async):\n${result.error.errors.map((e) => e.message).join("\n")}`,
          );
        }
        return result.data;
      },
      inject: options.inject || [],
    };

    const kafkaServiceProvider: Provider = {
      provide: KafkaService,
      useFactory: (
        cfg: KafkaModuleOptions,
        discovery: DiscoveryService,
        scanner: MetadataScanner,
        reflector: Reflector,
      ) => new KafkaService(cfg, discovery, scanner, reflector),
      inject: [KAFKA_OPTIONS, DiscoveryService, MetadataScanner, Reflector],
    };

    return {
      module: KafkaModule,
      imports: [...(options.imports || []), DiscoveryModule],
      providers: [asyncOptionsProvider, kafkaServiceProvider],
      exports: [KafkaService],
    };
  }
}
