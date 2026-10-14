# Bundled stickers (optional)

Images listed in `manifest.json` are copied into the user's sticker library on
first launch. Format:

```json
{
  "randomIconTags": ["my-tag"],
  "items": [
    { "id": "my-sticker-01", "name": "My sticker", "tags": ["my-tag"], "file": "my-folder/sticker-01.png" }
  ]
}
```

- `id` must be stable: an id already in the library is never re-added or overwritten.
- `file` is relative to this folder (PNG).
- `randomIconTags` (optional) is added to the notification random-icon filter the
  first time any sticker is seeded.
