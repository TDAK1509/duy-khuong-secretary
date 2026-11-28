export const JOIN_PHOTO_AND_RECORD_OF_SOURCE_SQL = `
  JOIN messages message ON message.id = source.message_id AND message.workspace_id = source.workspace_id
  JOIN records record ON record.message_id = source.message_id AND record.item_index = source.item_index AND record.workspace_id = source.workspace_id`;

export const PHOTO_IS_NOT_DELETED_SQL = `message.image_key IS NOT NULL AND message.image_deleted_at IS NULL`;
