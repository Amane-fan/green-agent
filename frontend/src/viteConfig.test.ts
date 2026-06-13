// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'vite';

import config from '../vite.config';

describe('vite dev server config', () => {
  it('proxies API requests to the FastAPI backend', () => {
    const userConfig = config as UserConfig;

    expect(userConfig.server?.proxy?.['/api']).toMatchObject({
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
    });
  });
});
