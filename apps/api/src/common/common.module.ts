import { Global, Module } from '@nestjs/common';
import { SuspensionService } from './suspension.service';

@Global()
@Module({ providers: [SuspensionService], exports: [SuspensionService] })
export class CommonModule {}
