/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { ChannelInboundEventContext, ChannelName } from '@hexabot-ai/api';
import {
  IncomingMessageType,
  StdEventType,
  StdIncomingMessage,
} from '@hexabot-ai/types';

import { Facebook } from '../../../types';

import FacebookMessageInboundEvent from './facebook-message.event';

export class FacebookEchoMessageInboundEvent<
  N extends ChannelName = ChannelName,
> extends FacebookMessageInboundEvent<N> {
  constructor(
    context: ChannelInboundEventContext<
      N,
      Facebook.DecodedMessaging,
      SubscriberChannelDict[N]
    >,
    private readonly text: string,
  ) {
    super(context);
  }

  override getEventType(): StdEventType {
    return StdEventType.echo;
  }

  override getMessageType(): IncomingMessageType {
    return IncomingMessageType.text;
  }

  override toStdIncomingMessage(): StdIncomingMessage {
    return {
      type: IncomingMessageType.text,
      data: {
        text: this.text,
      },
    };
  }
}

export default FacebookEchoMessageInboundEvent;
