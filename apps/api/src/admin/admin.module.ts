import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DeadLetterService } from './dead-letter.service';

@Module({ controllers: [AdminController], providers: [AdminService, DeadLetterService] })
export class AdminModule {}
