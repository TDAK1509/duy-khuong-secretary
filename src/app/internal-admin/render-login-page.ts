import { renderDocument } from './render-document.ts';
import {
  ADMIN_TITLE,
  CODE_FIELD_LABEL,
  LOGIN_BUTTON_LABEL,
  LOGIN_INTRO,
  LOGIN_STEP_COPY_CODE,
  LOGIN_STEP_OPEN_CHAT,
  LOGIN_STEP_SEND_COMMAND,
  LOGIN_STEP_SUBMIT,
} from './internal-admin-texts.ts';

export function renderLoginPage(message: string | null): string {
  return renderDocument(
    [
      '<section class="narrow">',
      `<h1>${ADMIN_TITLE}</h1>`,
      `<p class="lead">${LOGIN_INTRO}</p>`,
      '<div class="steps">',
      `<p>${LOGIN_STEP_OPEN_CHAT}</p>`,
      `<p>${LOGIN_STEP_SEND_COMMAND}</p>`,
      `<p>${LOGIN_STEP_COPY_CODE}</p>`,
      `<p>${LOGIN_STEP_SUBMIT}</p>`,
      '</div>',
      ...(message === null ? [] : [`<p role="alert">${message}</p>`]),
      renderCodeForm(),
      '</section>',
    ].join('\n'),
  );
}

function renderCodeForm(): string {
  return [
    '<form method="post" action="/admin/login">',
    `<label for="code">${CODE_FIELD_LABEL}</label>`,
    '<input id="code" name="code" type="text" required autocomplete="one-time-code" autocapitalize="characters" spellcheck="false">',
    `<button type="submit">${LOGIN_BUTTON_LABEL}</button>`,
    '</form>',
  ].join('\n');
}
