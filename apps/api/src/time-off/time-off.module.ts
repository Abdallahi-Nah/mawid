import { Module } from '@nestjs/common';
import { TimeOffController } from './time-off.controller';
import { TimeOffService } from './time-off.service';

@Module({ controllers: [TimeOffController], providers: [TimeOffService] })
export class TimeOffModule {}
