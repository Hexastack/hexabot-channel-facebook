/*
 * Hexabot — Fair Core License (FCL-1.0-ALv2)
 * Copyright (c) 2026 Hexastack.
 * Full terms: see LICENSE.md.
 */

import {
  FACEBOOK_CHANNEL_SOURCE_SETTINGS_SCHEMA,
  FACEBOOK_DEFAULT_USER_FIELDS,
  parseFacebookUserFields,
} from "../settings.schema";

describe("Facebook channel settings", () => {
  it("applies secure defaults", () => {
    const settings = FACEBOOK_CHANNEL_SOURCE_SETTINGS_SCHEMA.parse({});

    expect(settings).toMatchObject({
      app_secret: "",
      page_access_token: "",
      verify_token: "",
      graph_api_version: "v25.0",
      user_fields: FACEBOOK_DEFAULT_USER_FIELDS,
      persistent_menu: true,
      composer_input_disabled: false,
      sync_messenger_profile: true,
      thread_inactivity_hours: 24,
    });
  });

  it("parses comma-separated profile fields", () => {
    const settings = FACEBOOK_CHANNEL_SOURCE_SETTINGS_SCHEMA.parse({
      user_fields: "first_name, last_name, , profile_pic",
    });

    expect(parseFacebookUserFields(settings)).toEqual([
      "first_name",
      "last_name",
      "profile_pic",
    ]);
  });
});
