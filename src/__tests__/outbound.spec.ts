/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import { ButtonType, FileType, OutgoingMessageType } from "@hexabot-ai/types";

import { FacebookOutboundMessageEncoder } from "../outbound";

const channelAttachmentService = {
  getPublicUrl: jest.fn(
    async (_sourceId: string, attachment: { url?: string }) =>
      attachment.url ?? "https://cdn.example.com/file",
  ),
};
const i18n = {
  t: jest.fn((key: string) => key),
};

describe("FacebookOutboundMessageEncoder", () => {
  const encoder = new FacebookOutboundMessageEncoder(
    i18n as any,
    channelAttachmentService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("encodes text messages", async () => {
    await expect(
      encoder.encode(
        {
          type: OutgoingMessageType.text,
          data: {
            text: "Hello",
          },
        },
        { sourceId: "source-1" },
      ),
    ).resolves.toEqual({
      text: "Hello",
    });
  });

  it("encodes quick replies", async () => {
    await expect(
      encoder.encode(
        {
          type: OutgoingMessageType.quickReply,
          data: {
            text: "Pick one",
            quickReplies: [{ title: "A", payload: "A" }],
          },
        },
        { sourceId: "source-1" },
      ),
    ).resolves.toEqual({
      text: "Pick one",
      quick_replies: [
        {
          content_type: "text",
          title: "A",
          payload: "A",
        },
      ],
    });
  });

  it("encodes buttons and normalizes web URLs", async () => {
    await expect(
      encoder.encode(
        {
          type: OutgoingMessageType.buttons,
          data: {
            text: "Choose",
            buttons: [
              {
                type: ButtonType.web_url,
                title: "Open",
                url: "example.com",
              },
              {
                type: ButtonType.postback,
                title: "Select",
                payload: "SELECT",
              },
            ],
          },
        },
        { sourceId: "source-1" },
      ),
    ).resolves.toMatchObject({
      attachment: {
        payload: {
          template_type: "button",
          buttons: [
            {
              type: "web_url",
              url: "https://example.com",
            },
            {
              type: "postback",
              payload: "SELECT",
            },
          ],
        },
      },
    });
  });

  it("encodes attachments with public URLs", async () => {
    await expect(
      encoder.encode(
        {
          type: OutgoingMessageType.attachment,
          data: {
            attachment: {
              type: FileType.image,
              payload: {
                id: "attachment-1",
                url: "https://files.example.com/image.png",
              },
            },
          },
        },
        { sourceId: "source-1" },
      ),
    ).resolves.toMatchObject({
      attachment: {
        type: "image",
        payload: {
          url: "https://files.example.com/image.png",
          is_reusable: false,
        },
      },
    });
  });

  it("encodes overflowing lists as generic templates with a View More element", async () => {
    const elements = Array.from({ length: 10 }, (_, index) => ({
      id: `item-${index}`,
      title: `Item ${index}`,
      url: `example.com/${index}`,
    }));
    const message = await encoder.encode(
      {
        type: OutgoingMessageType.list,
        data: {
          elements,
          pagination: {
            total: 20,
            skip: 0,
            limit: 10,
          },
          options: {} as any,
        },
      },
      {
        sourceId: "source-1",
        content: {
          fields: {
            title: "title",
            url: "url",
          },
          buttons: [
            {
              type: ButtonType.web_url,
              title: "Open",
              url: "",
            },
          ],
          limit: 10,
        },
      } as any,
    );
    const genericPayload = (message as any).attachment.payload;

    expect(genericPayload.elements).toHaveLength(10);
    expect(genericPayload.elements.at(-1)?.title).toBe("View More");
  });
});
