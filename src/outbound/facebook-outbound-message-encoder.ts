/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import {
  ChannelAttachmentService,
  ChannelOutboundMessageEncoder,
  ContentOrmEntity,
  I18nService,
} from "@hexabot-ai/api";
import {
  ActionOptions,
  AttachmentRef,
  Button,
  ButtonType,
  ContentElement,
  FileType,
  OutgoingMessageType,
  StdOutgoingAttachmentMessageData,
  StdOutgoingButtonsMessageData,
  StdOutgoingListMessageData,
  StdOutgoingMessageEnvelope,
  StdOutgoingQuickRepliesMessageData,
  StdOutgoingTextMessageData,
} from "@hexabot-ai/types";
import { Injectable, Type } from "@nestjs/common";

import { Facebook } from "../types";

export type FacebookSourceScopedEncodeOptions = ActionOptions & {
  sourceId: string;
};

const MESSENGER_BUTTON_LIMIT = 3;
const MESSENGER_GENERIC_ELEMENT_LIMIT = 10;
const MESSENGER_QUICK_REPLY_LIMIT = 13;

export class FacebookOutboundMessageEncoder extends ChannelOutboundMessageEncoder<
  Facebook.OutboundMessage,
  FacebookSourceScopedEncodeOptions
> {
  constructor(
    private readonly i18n: I18nService,
    private readonly channelAttachmentService: ChannelAttachmentService,
  ) {
    super();
  }

  async encode(
    envelope: StdOutgoingMessageEnvelope,
    options: FacebookSourceScopedEncodeOptions,
  ): Promise<Facebook.OutboundMessage> {
    if (!options?.sourceId) {
      throw new Error("Missing sourceId in outbound encode options");
    }

    return await this.dispatchEnvelope(envelope, options, {
      [OutgoingMessageType.text]: ({ data }) => this.encodeTextMessage(data),
      [OutgoingMessageType.quickReply]: ({ data }) =>
        this.encodeQuickRepliesMessage(data),
      [OutgoingMessageType.buttons]: ({ data }) =>
        this.encodeButtonsMessage(data),
      [OutgoingMessageType.attachment]: ({ data }, sourceOptions) =>
        this.encodeAttachmentMessage(data, sourceOptions.sourceId),
      [OutgoingMessageType.list]: ({ data }, actionOptions) =>
        this.encodeListMessage(data, actionOptions),
      [OutgoingMessageType.carousel]: ({ data }, actionOptions) =>
        this.encodeCarouselMessage(data, actionOptions),
    });
  }

  protected encodeTextMessage(
    message: StdOutgoingTextMessageData,
  ): Facebook.OutboundMessage {
    return {
      text: message.text,
    };
  }

  protected encodeQuickRepliesMessage(
    message: StdOutgoingQuickRepliesMessageData,
  ): Facebook.OutboundMessage {
    return {
      text: message.text,
      quick_replies: this.encodeQuickReplies(message.quickReplies),
    };
  }

  protected encodeButtonsMessage(
    message: StdOutgoingButtonsMessageData,
  ): Facebook.OutboundMessage {
    if (message.buttons.length === 0) {
      throw new Error("Messenger button template requires at least one button");
    }

    return {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: message.text,
          buttons: this.encodeButtons(message.buttons),
        },
      },
    };
  }

  protected async encodeAttachmentMessage(
    message: StdOutgoingAttachmentMessageData,
    sourceId: string,
  ): Promise<Facebook.OutboundMessage> {
    const payload: Facebook.OutboundMessage = {
      attachment: {
        type: this.toMessengerAttachmentType(message.attachment.type),
        payload: {
          url: await this.channelAttachmentService.getPublicUrl(
            sourceId,
            message.attachment.payload,
          ),
          is_reusable: false,
        },
      },
    };

    if (message.quickReplies && message.quickReplies.length > 0) {
      return {
        ...payload,
        quick_replies: this.encodeQuickReplies(message.quickReplies),
      };
    }

    return payload;
  }

  protected async encodeListMessage(
    message: StdOutgoingListMessageData,
    options: FacebookSourceScopedEncodeOptions,
  ): Promise<Facebook.OutboundMessage> {
    if (!message.elements.length) {
      throw new Error("Messenger list message requires at least one element");
    }

    const elements = await this.encodeContentElements(
      message.elements,
      options,
    );
    const hasMore =
      message.pagination.total -
        message.pagination.skip -
        message.pagination.limit >
      0;
    const cappedElements = hasMore
      ? elements.slice(0, MESSENGER_GENERIC_ELEMENT_LIMIT - 1)
      : elements.slice(0, MESSENGER_GENERIC_ELEMENT_LIMIT);

    if (hasMore) {
      cappedElements.push(this.encodeViewMoreElement());
    }

    return this.encodeGenericTemplate(cappedElements);
  }

  protected async encodeCarouselMessage(
    message: StdOutgoingListMessageData,
    options: FacebookSourceScopedEncodeOptions,
  ): Promise<Facebook.OutboundMessage> {
    if (!message.elements.length) {
      throw new Error(
        "Messenger carousel message requires at least one element",
      );
    }

    const elements = await this.encodeContentElements(
      message.elements,
      options,
    );

    return this.encodeGenericTemplate(
      elements.slice(0, MESSENGER_GENERIC_ELEMENT_LIMIT),
    );
  }

  private encodeGenericTemplate(
    elements: Facebook.GenericElement[],
  ): Facebook.OutboundMessage {
    return {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements,
        },
      },
    };
  }

  private encodeQuickReplies(
    quickReplies: StdOutgoingQuickRepliesMessageData["quickReplies"],
  ): Facebook.QuickReply[] {
    if (quickReplies.length > MESSENGER_QUICK_REPLY_LIMIT) {
      throw new Error(
        `Messenger supports up to ${MESSENGER_QUICK_REPLY_LIMIT} quick replies`,
      );
    }

    return quickReplies.map((quickReply) => ({
      content_type: "text",
      title: quickReply.title,
      payload: quickReply.payload,
    }));
  }

  private encodeButtons(buttons: Button[]): Facebook.Button[] {
    if (buttons.length > MESSENGER_BUTTON_LIMIT) {
      throw new Error(
        `Messenger supports up to ${MESSENGER_BUTTON_LIMIT} buttons`,
      );
    }

    return buttons.map((button) => this.encodeButton(button));
  }

  private encodeButton(button: Button): Facebook.Button {
    if (button.type === ButtonType.web_url) {
      return {
        type: "web_url",
        title: button.title,
        url: this.ensureHttpUrl(button.url),
        messenger_extensions: button.messenger_extensions,
        webview_height_ratio: button.webview_height_ratio,
      };
    }

    return {
      type: "postback",
      title: button.title,
      payload: button.payload,
    };
  }

  private async encodeContentElements(
    data: ContentElement[],
    options: FacebookSourceScopedEncodeOptions,
  ): Promise<Facebook.GenericElement[]> {
    if (!options.content?.fields) {
      throw new Error("Content options are missing the fields");
    }

    const fields = options.content.fields;
    const buttons: Button[] = options.content.buttons ?? [];
    const result: Facebook.GenericElement[] = [];

    for (const item of data) {
      const title = this.stringifyField(item[fields.title]);
      const element: Facebook.GenericElement = {
        title,
      };

      if (fields.subtitle && item[fields.subtitle]) {
        element.subtitle = this.stringifyField(item[fields.subtitle]);
      }

      if (fields.image_url && item[fields.image_url]) {
        const value = item[fields.image_url];
        const attachmentRef =
          typeof value === "string"
            ? { url: value }
            : (value as { payload?: AttachmentRef }).payload;

        if (attachmentRef) {
          element.image_url = await this.channelAttachmentService.getPublicUrl(
            options.sourceId,
            attachmentRef,
          );
        }
      }

      const encodedButtons = buttons
        .slice(0, MESSENGER_BUTTON_LIMIT)
        .map((button, index) =>
          this.encodeContentButton(button, index, item, fields),
        );

      if (encodedButtons.length > 0) {
        element.buttons = encodedButtons;
        const defaultAction = encodedButtons.find(
          (button): button is Extract<Facebook.Button, { type: "web_url" }> =>
            button.type === "web_url",
        );

        if (defaultAction) {
          element.default_action = defaultAction;
        }
      }

      result.push(element);
    }

    return result;
  }

  private encodeContentButton(
    button: Button,
    index: number,
    item: ContentElement,
    fields: NonNullable<FacebookSourceScopedEncodeOptions["content"]>["fields"],
  ): Facebook.Button {
    const btn = { ...button };

    if (
      index === 0 &&
      fields.action_title &&
      item[fields.action_title] !== undefined
    ) {
      btn.title = this.stringifyField(item[fields.action_title]);
    }

    if (btn.type === ButtonType.web_url) {
      const urlField = fields.url;
      const url =
        urlField && item[urlField]
          ? this.stringifyField(item[urlField])
          : ContentOrmEntity.getUrl(item);

      return this.encodeButton({
        ...btn,
        url,
      });
    }

    const payload =
      "action_payload" in fields &&
      fields.action_payload &&
      fields.action_payload in item
        ? `${btn.title}:${this.stringifyField(item[fields.action_payload])}`
        : `${btn.title}:${ContentOrmEntity.getPayload(item)}`;

    return this.encodeButton({
      ...btn,
      payload,
    });
  }

  private encodeViewMoreElement(): Facebook.GenericElement {
    return {
      title: this.i18n.t("View More"),
      buttons: [
        {
          type: "postback",
          title: this.i18n.t("View More"),
          payload: "VIEW_MORE",
        },
      ],
    };
  }

  private toMessengerAttachmentType(
    fileType: FileType,
  ): "image" | "audio" | "video" | "file" {
    if (
      fileType === FileType.image ||
      fileType === FileType.audio ||
      fileType === FileType.video
    ) {
      return fileType;
    }

    return "file";
  }

  private stringifyField(value: unknown): string {
    return value === undefined || value === null ? "" : String(value);
  }

  private ensureHttpUrl(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
}

export function createFacebookOutboundMessageEncoder(
  _channelName: string,
): Type<FacebookOutboundMessageEncoder> {
  @Injectable()
  class BoundFacebookOutboundMessageEncoder extends FacebookOutboundMessageEncoder {
    constructor(
      i18n: I18nService,
      channelAttachmentService: ChannelAttachmentService,
    ) {
      super(i18n, channelAttachmentService);
    }
  }

  return BoundFacebookOutboundMessageEncoder;
}

export default FacebookOutboundMessageEncoder;
