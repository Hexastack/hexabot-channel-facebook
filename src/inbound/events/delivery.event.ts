/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { ChannelInboundEventContext, ChannelName } from "@hexabot-ai/api";
import { StdEventType } from "@hexabot-ai/types";

import { Facebook } from "../../types";

import BaseFacebookInboundEvent from "./base-facebook-inbound.event";

export class FacebookDeliveryInboundEvent<
  N extends ChannelName = ChannelName,
> extends BaseFacebookInboundEvent<N> {
  constructor(
    context: ChannelInboundEventContext<
      N,
      Facebook.DecodedMessaging,
      SubscriberChannelDict[N]
    >,
    private readonly deliveredMessageIds: string[],
  ) {
    super(context);
  }

  override getEventType(): StdEventType {
    return StdEventType.delivery;
  }

  getDeliveredMessages(): string[] {
    return this.deliveredMessageIds;
  }
}

export default FacebookDeliveryInboundEvent;
