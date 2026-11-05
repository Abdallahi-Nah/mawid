import { Global, Module } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { AiController } from './ai.controller';
import { AiOwnerController } from './ai-owner.controller';
import { AiOwnerService } from './ai-owner.service';
import { AiGateway } from './ai-gateway';
import { AiToolbox } from './ai-tools';
import { GroqLlmClient } from './groq-llm.client';
import { LlmClient } from './llm.client';

@Global()
@Module({
  controllers: [AiController, AiOwnerController],
  providers: [
    { provide: LlmClient, useClass: GroqLlmClient },
    AiGateway,
    AiToolbox,
    AiChatService,
    AiOwnerService,
  ],
  exports: [AiGateway],
})
export class AiModule {}
