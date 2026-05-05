/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { randomUUID } from "crypto";

import {
  ChannelInboundEvent,
  ChannelInboundEventContext,
  ChannelInboundEventDecoder,
  ChannelName,
} from "@hexabot-ai/api";
import { Injectable, Type } from "@nestjs/common";

import { Facebook } from "../types";

import FacebookDeliveryInboundEvent from "./events/delivery.event";
import FacebookAttachmentMessageInboundEvent from "./events/messages/attachment.event";
import FacebookEchoMessageInboundEvent from "./events/messages/echo.event";
import FacebookLocationMessageInboundEvent from "./events/messages/location.event";
import FacebookPostbackInboundEvent from "./events/messages/postback.event";
import FacebookQuickReplyInboundEvent from "./events/messages/quick-reply.event";
import FacebookTextMessageInboundEvent from "./events/messages/text.event";
import FacebookReadInboundEvent from "./events/read.event";

export class FacebookInboundEventDecoder<
  N extends ChannelName = ChannelName,
> implements ChannelInboundEventDecoder<
  N,
  ChannelInboundEvent<N, Facebook.DecodedMessaging, SubscriberChannelDict[N]>,
  SubscriberChannelDict[N]
> {
  readonly channel: N;

  constructor(channel: N) {
    this.channel = channel;
  }

  createEvents(
    raw: unknown,
    channelAttrs: SubscriberChannelDict[N],
  ): Array<
    ChannelInboundEvent<N, Facebook.DecodedMessaging, SubscriberChannelDict[N]>
  > {
    const event = Facebook.messagingSchema.parse(raw);
    const decoded = event as Facebook.DecodedMessaging;
    const concreteEvent = this.createEvent(decoded, channelAttrs);

    return concreteEvent ? [concreteEvent] : [];
  }

  private createEvent(
    event: Facebook.DecodedMessaging,
    channelAttrs: SubscriberChannelDict[N],
  ): ChannelInboundEvent<
    N,
    Facebook.DecodedMessaging,
    SubscriberChannelDict[N]
  > | null {
    if (event.delivery) {
      return new FacebookDeliveryInboundEvent(
        this.createStatusContext(event, channelAttrs),
        event.delivery.mids ?? [],
      );
    }

    if (event.read) {
      return new FacebookReadInboundEvent(
        this.createStatusContext(event, channelAttrs),
        event.read.watermark ?? event.timestamp ?? Date.now(),
      );
    }

    if (event.postback) {
      const payload = event.postback.payload ?? event.postback.title ?? "";

      return new FacebookPostbackInboundEvent(
        this.createMessageContext(event, channelAttrs),
        payload,
        event.postback.title ?? payload,
      );
    }

    if (!event.message) {
      return null;
    }

    if (event.message.is_echo) {
      return new FacebookEchoMessageInboundEvent(
        this.createEchoContext(event, channelAttrs),
        event.message.text ?? "",
      );
    }

    if (event.message.quick_reply?.payload) {
      return new FacebookQuickReplyInboundEvent(
        this.createMessageContext(event, channelAttrs),
        event.message.quick_reply.payload,
        event.message.text ?? event.message.quick_reply.payload,
      );
    }

    const location = this.findLocationAttachment(event.message.attachments);
    if (location?.payload.coordinates) {
      return new FacebookLocationMessageInboundEvent(
        this.createMessageContext(event, channelAttrs),
        location.payload.coordinates.lat,
        location.payload.coordinates.long,
      );
    }

    const downloadableAttachments = (event.message.attachments ?? []).filter(
      (attachment) => attachment.type !== "location",
    );
    if (downloadableAttachments.length > 0) {
      return new FacebookAttachmentMessageInboundEvent(
        this.createMessageContext(event, channelAttrs),
        downloadableAttachments,
      );
    }

    if (typeof event.message.text === "string") {
      return new FacebookTextMessageInboundEvent(
        this.createMessageContext(event, channelAttrs),
        event.message.text,
      );
    }

    return null;
  }

  private createMessageContext(
    event: Facebook.DecodedMessaging,
    channelAttrs: SubscriberChannelDict[N],
  ): ChannelInboundEventContext<
    N,
    Facebook.DecodedMessaging,
    SubscriberChannelDict[N]
  > {
    return this.createContext(
      event,
      channelAttrs,
      event.sender.id,
      event.recipient.id,
    );
  }

  private createStatusContext(
    event: Facebook.DecodedMessaging,
    channelAttrs: SubscriberChannelDict[N],
  ): ChannelInboundEventContext<
    N,
    Facebook.DecodedMessaging,
    SubscriberChannelDict[N]
  > {
    return this.createContext(
      event,
      channelAttrs,
      event.recipient.id,
      event.sender.id,
    );
  }

  private createEchoContext(
    event: Facebook.DecodedMessaging,
    channelAttrs: SubscriberChannelDict[N],
  ): ChannelInboundEventContext<
    N,
    Facebook.DecodedMessaging,
    SubscriberChannelDict[N]
  > {
    return this.createContext(
      event,
      channelAttrs,
      event.recipient.id,
      event.recipient.id,
    );
  }

  private createContext(
    event: Facebook.DecodedMessaging,
    channelAttrs: SubscriberChannelDict[N],
    senderForeignId: string,
    recipientForeignId: string,
  ): ChannelInboundEventContext<
    N,
    Facebook.DecodedMessaging,
    SubscriberChannelDict[N]
  > {
    return new ChannelInboundEventContext(
      this.channel,
      event,
      channelAttrs,
      this.getOccurredAt(event),
      this.getEventId(event),
      senderForeignId,
      recipientForeignId,
    );
  }

  private getOccurredAt(event: Facebook.DecodedMessaging): Date {
    const timestamp = event.timestamp;

    if (typeof timestamp === "number") {
      const date = new Date(timestamp);

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    return new Date();
  }

  private getEventId(event: Facebook.DecodedMessaging): string {
    if (event.message?.mid) {
      return event.message.mid;
    }

    if (event.postback?.mid) {
      return event.postback.mid;
    }

    if (event.delivery?.watermark) {
      return `delivery:${event.recipient.id}:${event.delivery.watermark}`;
    }

    if (event.read?.watermark) {
      return `read:${event.recipient.id}:${event.read.watermark}`;
    }

    return randomUUID();
  }

  private findLocationAttachment(
    attachments: Facebook.Attachment[] | undefined,
  ): Facebook.Attachment | undefined {
    return attachments?.find(
      (attachment) =>
        attachment.type === "location" && !!attachment.payload.coordinates,
    );
  }
}

export function createFacebookInboundEventDecoder<N extends ChannelName>(
  channelName: N,
): Type<FacebookInboundEventDecoder<N>> {
  @Injectable()
  class BoundFacebookInboundEventDecoder extends FacebookInboundEventDecoder<N> {
    constructor() {
      super(channelName);
    }
  }

  return BoundFacebookInboundEventDecoder;
}

export default FacebookInboundEventDecoder;
