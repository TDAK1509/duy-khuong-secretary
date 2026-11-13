export type LlmCallKind =
  | 'photo_read'
  | 'text_read'
  | 'chat_answer'
  | 'scheduled_run'
  | 'chatgpt_text_save'
  | 'operator_reread'
  | 'operator_backfill';
