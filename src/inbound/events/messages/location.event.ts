/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { ChannelInboundEventContext, ChannelName } from "@hexabot-ai/api";
import {
  IncomingMessageType,
  Payload,
  PayloadType,
  StdIncomingMessage,
} from "@hexabot-ai/types";

import { Facebook } from "../../../types";

import FacebookMessageInboundEvent from "./facebook-message.event";

export class FacebookLocationMessageInboundEvent<
  N extends ChannelName = ChannelName,
> extends FacebookMessageInboundEvent<N> {
  constructor(
    context: ChannelInboundEventContext<
      N,
      Facebook.DecodedMessaging,
      SubscriberChannelDict[N]
    >,
    private readonly lat: number,
    private readonly lon: number,
  ) {
    super(context);
  }

  override getMessageType(): IncomingMessageType {
    return IncomingMessageType.location;
  }

  override getPayload(): Payload {
    return {
      type: PayloadType.location,
      coordinates: {
        lat: this.lat,
        lon: this.lon,
      },
    };
  }

  override toStdIncomingMessage(): StdIncomingMessage {
    return {
      type: IncomingMessageType.location,
      data: {
        coordinates: {
          lat: this.lat,
          lon: this.lon,
        },
      },
    };
  }
}

export default FacebookLocationMessageInboundEvent;
