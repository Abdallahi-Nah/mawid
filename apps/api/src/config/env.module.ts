import { Global, Module } from '@nestjs/common';
import { Env, loadEnv } from './env';

export const ENV = Symbol('ENV');
export type { Env };

// Validated environment, injected with @Inject(ENV).
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class EnvModule {}
