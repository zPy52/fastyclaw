import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfigStore } from '@/config/index';

export function bearerAuth(config: AppConfigStore) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expected = config.get().authToken;
    if (!expected) {
      next();
      return;
    }

    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/.exec(header);
    if (!match || !timingSafeEqual(match[1], expected)) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    next();
  };
}

function timingSafeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  const length = Math.max(actualBuffer.length, expectedBuffer.length);
  const paddedActual = Buffer.alloc(length);
  const paddedExpected = Buffer.alloc(length);
  actualBuffer.copy(paddedActual);
  expectedBuffer.copy(paddedExpected);

  return cryptoTimingSafeEqual(paddedActual, paddedExpected)
    && actualBuffer.length === expectedBuffer.length;
}
