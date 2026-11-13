import { escapeHtml } from '../chatgpt/escape-html.ts';
import type { WorkspaceOverview } from './read-workspace-overview.ts';
import {
  ADD_CREDITS_BUTTON_LABEL,
  ADD_CREDITS_HEADING,
  CREDITS_FIELD_LABEL,
  NOTE_FIELD_LABEL,
  WORKSPACE_FIELD_LABEL,
} from './internal-admin-texts.ts';

export type AddCreditsFormView = { csrfToken: string; requestId: string; message: string | null };

export function renderAddCreditsForm(view: AddCreditsFormView, workspaces: WorkspaceOverview[]): string {
  return [
    `<h2>${ADD_CREDITS_HEADING}</h2>`,
    ...(view.message === null ? [] : [`<p role="alert">${view.message}</p>`]),
    '<form method="post" action="/admin/credits">',
    `<input type="hidden" name="csrf" value="${view.csrfToken}">`,
    `<input type="hidden" name="request_id" value="${view.requestId}">`,
    `<label for="workspace_id">${WORKSPACE_FIELD_LABEL}</label>`,
    `<select id="workspace_id" name="workspace_id" required>${workspaces.map(renderWorkspaceOption).join('')}</select>`,
    `<label for="credits">${CREDITS_FIELD_LABEL}</label>`,
    '<input id="credits" name="credits" type="text" inputmode="numeric" required autocomplete="off">',
    `<label for="note">${NOTE_FIELD_LABEL}</label>`,
    '<input id="note" name="note" type="text" required maxlength="500" autocomplete="off">',
    `<button type="submit">${ADD_CREDITS_BUTTON_LABEL}</button>`,
    '</form>',
  ].join('\n');
}

function renderWorkspaceOption(workspace: WorkspaceOverview): string {
  return `<option value="${workspace.id}">${escapeHtml(workspace.name)}</option>`;
}
