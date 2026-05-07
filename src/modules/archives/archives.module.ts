import { Module } from '@nestjs/common';
import { ArchivesController } from './archives.controller';
import { ArchivesService } from './archives.service';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports:     [LogsModule],
  controllers: [ArchivesController],
  providers:   [ArchivesService],
  exports:     [ArchivesService],
})
export class ArchivesModule {}
