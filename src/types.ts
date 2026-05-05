/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { z } from "zod";

export namespace Facebook {
  export type ChannelAttrs = {
    pageId: string;
    recipientId: string;
  };

  const idObjectSchema = z.looseObject({
    id: z.string(),
  });

  const coordinatesSchema = z.looseObject({
    lat: z.number(),
    long: z.number(),
  });

  export const attachmentSchema = z.looseObject({
    type: z.string(),
    payload: z.looseObject({
      url: z.string().optional(),
      title: z.string().optional(),
      sticker_id: z.union([z.string(), z.number()]).optional(),
      coordinates: coordinatesSchema.optional(),
    }),
  });

  export type Attachment = z.infer<typeof attachmentSchema>;

  export const messagingSchema = z.looseObject({
    sender: idObjectSchema,
    recipient: idObjectSchema,
    timestamp: z.number().optional(),
    message: z
      .looseObject({
        mid: z.string().optional(),
        text: z.string().optional(),
        is_echo: z.boolean().optional(),
        quick_reply: z
          .looseObject({
            payload: z.string(),
          })
          .optional(),
        attachments: z.array(attachmentSchema).optional(),
      })
      .optional(),
    postback: z
      .looseObject({
        mid: z.string().optional(),
        title: z.string().optional(),
        payload: z.string().optional(),
      })
      .optional(),
    delivery: z
      .looseObject({
        mids: z.array(z.string()).optional(),
        watermark: z.number().optional(),
      })
      .optional(),
    read: z
      .looseObject({
        watermark: z.number().optional(),
      })
      .optional(),
  });

  export type Messaging = z.infer<typeof messagingSchema>;

  export type DecodedMessaging = Messaging & {
    entryId?: string;
  };

  export const webhookSchema = z.looseObject({
    object: z.string(),
    entry: z.array(
      z.looseObject({
        id: z.string().optional(),
        time: z.number().optional(),
        messaging: z.array(messagingSchema).optional(),
      }),
    ),
  });

  export type Webhook = z.infer<typeof webhookSchema>;

  export type UserProfile = {
    first_name?: string;
    last_name?: string;
    profile_pic?: string;
    locale?: string;
    timezone?: number;
    gender?: string;
  };

  export type SendApiRecipient = {
    id: string;
  };

  export type QuickReply = {
    content_type: "text";
    title: string;
    payload: string;
  };

  export type Button =
    | {
        type: "postback";
        title: string;
        payload: string;
      }
    | {
        type: "web_url";
        title: string;
        url: string;
        messenger_extensions?: boolean;
        webview_height_ratio?: "compact" | "tall" | "full";
      };

  export type GenericElement = {
    title: string;
    subtitle?: string;
    image_url?: string;
    default_action?: Extract<Button, { type: "web_url" }>;
    buttons?: Button[];
  };

  export type OutboundMessage =
    | {
        text: string;
        quick_replies?: QuickReply[];
      }
    | {
        attachment: {
          type: "template";
          payload: {
            template_type: "button";
            text: string;
            buttons: Button[];
          };
        };
      }
    | {
        attachment: {
          type: "template";
          payload: {
            template_type: "generic";
            elements: GenericElement[];
          };
        };
      }
    | {
        attachment: {
          type: "image" | "audio" | "video" | "file";
          payload: {
            url: string;
            is_reusable: boolean;
          };
        };
        quick_replies?: QuickReply[];
      };

  export type SendApiPayload = {
    recipient: SendApiRecipient;
    message?: OutboundMessage;
    sender_action?: "typing_on" | "typing_off";
    messaging_type?: "RESPONSE" | "UPDATE" | "MESSAGE_TAG";
    tag?: string;
  };

  export type SendApiResponse = {
    recipient_id?: string;
    message_id?: string;
  };

  export type MessengerProfile = {
    greeting?: Array<{ locale: "default"; text: string }>;
    get_started?: { payload: string };
    persistent_menu?: Array<{
      locale: "default";
      composer_input_disabled: boolean;
      call_to_actions: MessengerProfileMenuItem[];
    }>;
  };

  export type MessengerProfileMenuItem =
    | {
        type: "nested";
        title: string;
        call_to_actions: MessengerProfileMenuItem[];
      }
    | {
        type: "postback";
        title: string;
        payload: string;
      }
    | {
        type: "web_url";
        title: string;
        url: string;
      };
}
