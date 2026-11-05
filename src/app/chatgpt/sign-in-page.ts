import {
  CODE_FIELD_LABEL,
  CONTINUE_BUTTON_LABEL,
  SIGN_IN_INTRO,
  SIGN_IN_PHISHING_NOTE,
  SIGN_IN_STEP_CONTINUE,
  SIGN_IN_STEP_COPY_CODE,
  SIGN_IN_STEP_OPEN_CHAT,
  SIGN_IN_STEP_SEND_COMMAND,
  SIGN_IN_TITLE,
  SIGN_IN_WORKSPACE_NOTE,
} from './sign-in-texts.ts';

const PAGE_STYLE = `
  body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; line-height: 1.5; }
  main { max-width: 36rem; margin: 0 auto; }
  input, button { box-sizing: border-box; width: 100%; min-height: 48px; font-size: 1rem; margin-top: 8px; }
`;

export function renderSignInPage(): string {
  return [
    '<!doctype html>',
    '<html lang="vi">',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${SIGN_IN_TITLE}</title><style>${PAGE_STYLE}</style></head>`,
    `<body><main><h1>${SIGN_IN_TITLE}</h1>`,
    `<p>${SIGN_IN_INTRO}</p>`,
    `<p>${SIGN_IN_STEP_OPEN_CHAT}</p>`,
    `<p>${SIGN_IN_STEP_SEND_COMMAND}</p>`,
    `<p>${SIGN_IN_STEP_COPY_CODE}</p>`,
    `<p>${SIGN_IN_STEP_CONTINUE}</p>`,
    renderCodeForm(),
    `<p>${SIGN_IN_WORKSPACE_NOTE}</p>`,
    `<p>${SIGN_IN_PHISHING_NOTE}</p>`,
    '</main></body></html>',
  ].join('\n');
}

function renderCodeForm(): string {
  return [
    '<form method="post" action="/oauth/authorize">',
    `<label for="code">${CODE_FIELD_LABEL}</label>`,
    '<input id="code" name="code" type="text" required autocomplete="one-time-code" autocapitalize="characters" spellcheck="false">',
    `<button type="submit">${CONTINUE_BUTTON_LABEL}</button>`,
    '</form>',
  ].join('\n');
}
