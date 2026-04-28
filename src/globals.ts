/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { FACEBOOK_CHANNEL_NAME } from './settings.schema';

declare global {
  interface SubscriberChannelDict {
    [key: string]: Record<string, unknown>;
    [FACEBOOK_CHANNEL_NAME]: {
      pageId: string;
      recipientId: string;
    };
  }
}

export { };

