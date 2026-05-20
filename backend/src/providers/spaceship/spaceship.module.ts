import { Module } from '@nestjs/common';
import { SpaceshipService } from './spaceship.service';

@Module({
  providers: [SpaceshipService],
  exports: [SpaceshipService],
})
export class SpaceshipModule {}
