/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { createHmac } from 'crypto';

import type { Source } from '@hexabot-ai/types';
import { Request, Response } from 'express';

import { FacebookInboundEventDecoder } from '../inbound';
import FacebookChannelHandler from '../index.channel';
import { FACEBOOK_CHANNEL_NAME } from '../settings.schema';

class TestFacebookChannelHandler extends FacebookChannelHandler {
  callVerifySignature(req: Request, source: Source) {
    return this.verifySignature(req, {} as Response, source);
  }

  callVerifyWebhook(req: Request, res: Response, source: Source) {
    return this.verifyWebhook(req, res, source);
  }

  callDecode(req: Request, source: Source) {
    return this.decode(req, source);
  }
}

const source = {
  id: 'source-1',
  channel: FACEBOOK_CHANNEL_NAME,
  state: true,
  settings: {
    app_secret: 'secret',
    page_access_token: 'page-token',
    verify_token: 'verify-token',
    page_id: 'page-1',
  },
} as unknown as Source;
const buildRequest = (body: unknown, headers: Record<string, string> = {}) =>
  ({
    body,
    headers,
    rawBody: JSON.stringify(body),
    query: {},
  }) as Request & { rawBody: string };

describe('FacebookChannelHandler webhook security', () => {
  let handler: TestFacebookChannelHandler;

  beforeEach(() => {
    handler = new TestFacebookChannelHandler();
    (handler as any).logger = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    (handler as any).inboundEventDecoder = new FacebookInboundEventDecoder(
      FACEBOOK_CHANNEL_NAME,
    );
  });

  it('accepts a valid SHA-256 webhook signature', async () => {
    const req = buildRequest({ object: 'page', entry: [] });
    const digest = createHmac('sha256', 'secret')
      .update(req.rawBody)
      .digest('hex');
    req.headers['x-hub-signature-256'] = `sha256=${digest}`;

    await expect(
      handler.callVerifySignature(req, source),
    ).resolves.toBeUndefined();
  });

  it('rejects an invalid webhook signature', async () => {
    const req = buildRequest(
      { object: 'page', entry: [] },
      { 'x-hub-signature-256': 'sha256=bad' },
    );

    await expect(handler.callVerifySignature(req, source)).rejects.toThrow(
      'Invalid Facebook webhook signature',
    );
  });

  it('supports legacy SHA-1 signatures when SHA-256 is absent', async () => {
    const req = buildRequest({ object: 'page', entry: [] });
    const digest = createHmac('sha1', 'secret')
      .update(req.rawBody)
      .digest('hex');
    req.headers['x-hub-signature'] = `sha1=${digest}`;

    await expect(
      handler.callVerifySignature(req, source),
    ).resolves.toBeUndefined();
  });

  it('responds to valid webhook verification challenges', async () => {
    const req = {
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'verify-token',
        'hub.challenge': 'challenge-code',
      },
    } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response;

    await handler.callVerifyWebhook(req, res, source);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('challenge-code');
  });

  it('drops webhook events for another configured page', async () => {
    const req = buildRequest({
      object: 'page',
      entry: [
        {
          id: 'other-page',
          messaging: [
            {
              sender: { id: 'user-1' },
              recipient: { id: 'other-page' },
              message: {
                mid: 'm-1',
                text: 'hello',
              },
            },
          ],
        },
      ],
    });

    await expect(handler.callDecode(req, source)).resolves.toEqual([]);
  });
});
