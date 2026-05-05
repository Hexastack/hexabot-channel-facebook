/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { ChannelInboundEventContext, ChannelName } from "@hexabot-ai/api";
import { IncomingMessageType, StdIncomingMessage } from "@hexabot-ai/types";

import { Facebook } from "../../../types";

import FacebookMessageInboundEvent from "./facebook-message.event";

export class FacebookQuickReplyInboundEvent<
  N extends ChannelName = ChannelName,
> extends FacebookMessageInboundEvent<N> {
  constructor(
    context: ChannelInboundEventContext<
      N,
      Facebook.DecodedMessaging,
      SubscriberChannelDict[N]
    >,
    private readonly payload: string,
    private readonly text: string,
  ) {
    super(context);
  }

  override getMessageType(): IncomingMessageType {
    return IncomingMessageType.quickReply;
  }

  override getPayload(): string {
    return this.payload;
  }

  override toStdIncomingMessage(): StdIncomingMessage {
    return {
      type: IncomingMessageType.quickReply,
      data: {
        text: this.text,
        payload: this.payload,
      },
    };
  }
}

export default FacebookQuickReplyInboundEvent;
