import { Global, Module } from "@nestjs/common";
import { TokenDenylistService } from "./token-denylist.service";

@Global()
@Module({
  providers: [TokenDenylistService],
  exports: [TokenDenylistService],
})
export class TokenDenylistModule {}
