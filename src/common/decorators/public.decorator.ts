import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks an endpoint as public — skips JWT authentication guard */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
