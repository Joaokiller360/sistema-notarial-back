import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports:     [LogsModule],
  controllers: [SettingsController],
  providers:   [SettingsService],
  exports:     [SettingsService],
})
export class SettingsModule {}
