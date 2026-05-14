import { PartialType } from "@nestjs/swagger";
import { CreateNotaryDto } from "./create-notary.dto";

export class UpdateNotaryDto extends PartialType(CreateNotaryDto) {}
