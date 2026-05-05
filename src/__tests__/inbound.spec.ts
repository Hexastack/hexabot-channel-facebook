/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import {
  IncomingMessageType,
  PayloadType,
  StdEventType,
} from "@hexabot-ai/types";

import { FacebookInboundEventDecoder } from "../inbound";
import {
  FacebookAttachmentMessageInboundEvent,
  FacebookDeliveryInboundEvent,
  FacebookEchoMessageInboundEvent,
  FacebookLocationMessageInboundEvent,
  FacebookPostbackInboundEvent,
  FacebookQuickReplyInboundEvent,
  FacebookReadInboundEvent,
  FacebookTextMessageInboundEvent,
} from "../inbound/events";
import { FACEBOOK_CHANNEL_NAME } from "../settings.schema";

const attrs = {
  pageId: "page-1",
  recipientId: "page-1",
};
const baseEvent = {
  sender: { id: "user-1" },
  recipient: { id: "page-1" },
  timestamp: 1710000000000,
};
const expectFacebookEvent = <T>(
  event: unknown,
  eventClass: abstract new (...args: any[]) => T,
): T => {
  expect(event).toBeInstanceOf(eventClass);

  return event as T;
};

describe("FacebookInboundEventDecoder", () => {
  const decoder = new FacebookInboundEventDecoder(FACEBOOK_CHANNEL_NAME);

  it("decodes text messages", () => {
    const [event] = decoder.createEvents(
      {
        ...baseEvent,
        message: {
          mid: "m-text",
          text: "hello",
        },
      },
      attrs,
    );
    const messageEvent = expectFacebookEvent(
      event,
      FacebookTextMessageInboundEvent,
    );

    expect(messageEvent.getEventType()).toBe(StdEventType.message);
    expect(messageEvent.getSenderForeignId()).toBe("user-1");
    expect(messageEvent.getMessage()).toEqual({
      type: IncomingMessageType.text,
      data: { text: "hello" },
    });
  });

  it("decodes quick replies with string payloads", () => {
    const [event] = decoder.createEvents(
      {
        ...baseEvent,
        message: {
          mid: "m-qr",
          text: "Blue",
          quick_reply: {
            payload: "COLOR_BLUE",
          },
        },
      },
      attrs,
    );
    const messageEvent = expectFacebookEvent(
      event,
      FacebookQuickReplyInboundEvent,
    );

    expect(messageEvent.getPayload()).toBe("COLOR_BLUE");
  });

  it("decodes postbacks including get started payloads", () => {
    const [event] = decoder.createEvents(
      {
        ...baseEvent,
        postback: {
          mid: "m-postback",
          title: "Get Started",
          payload: "GET_STARTED",
        },
      },
      attrs,
    );
    const messageEvent = expectFacebookEvent(
      event,
      FacebookPostbackInboundEvent,
    );

    expect(messageEvent.getPayload()).toBe("GET_STARTED");
  });

  it("decodes location attachments", () => {
    const [event] = decoder.createEvents(
      {
        ...baseEvent,
        message: {
          mid: "m-location",
          attachments: [
            {
              type: "location",
              payload: {
                coordinates: {
                  lat: 36.8,
                  long: 10.18,
                },
              },
            },
          ],
        },
      },
      attrs,
    );
    const messageEvent = expectFacebookEvent(
      event,
      FacebookLocationMessageInboundEvent,
    );

    expect(messageEvent.getPayload()).toEqual({
      type: PayloadType.location,
      coordinates: {
        lat: 36.8,
        lon: 10.18,
      },
    });
  });

  it("decodes remote attachment messages", () => {
    const [event] = decoder.createEvents(
      {
        ...baseEvent,
        message: {
          mid: "m-file",
          attachments: [
            {
              type: "image",
              payload: {
                url: "https://example.com/image.png",
              },
            },
          ],
        },
      },
      attrs,
    );
    const messageEvent = expectFacebookEvent(
      event,
      FacebookAttachmentMessageInboundEvent,
    );

    expect(messageEvent.getRemoteAttachments()).toHaveLength(1);
  });

  it("decodes delivery and read receipts against the subscriber id", () => {
    const [delivery] = decoder.createEvents(
      {
        sender: { id: "page-1" },
        recipient: { id: "user-1" },
        delivery: {
          mids: ["m-1", "m-2"],
          watermark: 1710000000000,
        },
      },
      attrs,
    );
    const [read] = decoder.createEvents(
      {
        sender: { id: "page-1" },
        recipient: { id: "user-1" },
        read: {
          watermark: 1710000001000,
        },
      },
      attrs,
    );
    const deliveryEvent = expectFacebookEvent(
      delivery,
      FacebookDeliveryInboundEvent,
    );
    const readEvent = expectFacebookEvent(read, FacebookReadInboundEvent);

    expect(deliveryEvent.getSenderForeignId()).toBe("user-1");
    expect(deliveryEvent.getDeliveredMessages()).toEqual(["m-1", "m-2"]);
    expect(readEvent.getSenderForeignId()).toBe("user-1");
    expect(readEvent.getWatermark()).toBe(1710000001000);
  });

  it("decodes echo messages without resolving the page as subscriber", () => {
    const [event] = decoder.createEvents(
      {
        sender: { id: "page-1" },
        recipient: { id: "user-1" },
        message: {
          mid: "m-echo",
          is_echo: true,
          text: "sent by page",
        },
      },
      attrs,
    );
    const messageEvent = expectFacebookEvent(
      event,
      FacebookEchoMessageInboundEvent,
    );

    expect(messageEvent.getEventType()).toBe(StdEventType.echo);
    expect(messageEvent.getSenderForeignId()).toBe("user-1");
    expect(messageEvent.getRecipientForeignId()).toBe("user-1");
  });
});
