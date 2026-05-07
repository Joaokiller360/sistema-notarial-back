import { applyDecorators, Type } from '@nestjs/common';
import { ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

export const ApiPaginatedResponse = <TModel extends Type<any>>(model: TModel) =>
  applyDecorators(
    ApiOkResponse({
      schema: {
        properties: {
          data:  { type: 'array', items: { $ref: getSchemaPath(model) } },
          total: { type: 'number' },
          page:  { type: 'number' },
          limit: { type: 'number' },
          pages: { type: 'number' },
        },
      },
    }),
  );
