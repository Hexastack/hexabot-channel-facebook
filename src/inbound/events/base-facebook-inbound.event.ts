/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import {
  ChannelInboundEvent,
  ChannelInboundEventContext,
  ChannelName,
} from '@hexabot-ai/api';

import { Facebook } from '../../types';

export abstract class BaseFacebookInboundEvent<
  N extends ChannelName = ChannelName,
> extends ChannelInboundEvent<
  N,
  Facebook.DecodedMessaging,
  SubscriberChannelDict[N]
> {
  protected constructor(
    context: ChannelInboundEventContext<
      N,
      Facebook.DecodedMessaging,
      SubscriberChannelDict[N]
    >,
    handler?: Parameters<ChannelInboundEvent<N>['setHandler']>[0],
  ) {
    super(context, handler);
  }

  override getRaw<T = Facebook.DecodedMessaging>(): T {
    return super.getRaw<T>();
  }
}

export default BaseFacebookInboundEvent;
