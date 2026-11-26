-- Made-up data for the leak suite. Workspace A rows use ids that start with aaaaaaaa-, workspace B rows with bbbbbbbb-.

INSERT INTO users (id) VALUES
  ('aaaaaaaa-0001-4000-8000-000000000001'),
  ('aaaaaaaa-0001-4000-8000-000000000002'),
  ('bbbbbbbb-0001-4000-8000-000000000001');

INSERT INTO workspaces (id, name, credit_balance) VALUES
  ('aaaaaaaa-0002-4000-8000-000000000001', 'SAFE-A-WORKSPACE', 100),
  ('bbbbbbbb-0002-4000-8000-000000000001', 'LEAK-B-WORKSPACE', 200);

INSERT INTO channel_identities (id, channel, account_id, external_user_id, user_id, zalo_name, current_workspace_id, last_inbound_at) VALUES
  ('aaaaaaaa-0003-4000-8000-000000000001', 'zalo-oa', 'seed-oa', 'seed-zalo-admin-a', 'aaaaaaaa-0001-4000-8000-000000000001', 'SAFE-A-ZALO-ADMIN', 'aaaaaaaa-0002-4000-8000-000000000001', now()),
  ('aaaaaaaa-0003-4000-8000-000000000002', 'zalo-oa', 'seed-oa', 'seed-zalo-driver', 'aaaaaaaa-0001-4000-8000-000000000002', 'SAFE-A-ZALO-DRIVER', 'aaaaaaaa-0002-4000-8000-000000000001', now()),
  ('bbbbbbbb-0003-4000-8000-000000000001', 'zalo-oa', 'seed-oa', 'seed-zalo-admin-b', 'bbbbbbbb-0001-4000-8000-000000000001', 'LEAK-B-ZALO-ADMIN', 'bbbbbbbb-0002-4000-8000-000000000001', now());

INSERT INTO memberships (id, workspace_id, user_id, role, display_name) VALUES
  ('aaaaaaaa-0004-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'admin', 'SAFE-A-ADMIN'),
  ('aaaaaaaa-0004-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'member', 'SAFE-A-DRIVER'),
  ('bbbbbbbb-0004-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'admin', 'LEAK-B-ADMIN'),
  ('bbbbbbbb-0004-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'member', 'LEAK-B-DRIVER'),
  ('bbbbbbbb-0004-4000-8000-000000000003', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'member', 'LEAK-B-ADMIN-MEMBER');

INSERT INTO organizations (id, workspace_id, type, name) VALUES
  ('aaaaaaaa-0005-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'company', 'SHARED-COMPANY'),
  ('aaaaaaaa-0005-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'company', 'SAFE-A-COMPANY'),
  ('bbbbbbbb-0005-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'company', 'SHARED-COMPANY'),
  ('bbbbbbbb-0005-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'company', 'LEAK-B-COMPANY');

INSERT INTO organization_aliases (id, workspace_id, organization_id, printed_name, match_key) VALUES
  ('aaaaaaaa-0006-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0005-4000-8000-000000000002', 'SAFE-A-ALIAS', 'safeaalias'),
  ('bbbbbbbb-0006-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0005-4000-8000-000000000002', 'LEAK-B-ALIAS', 'leakbalias'),
  ('aaaaaaaa-0006-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0005-4000-8000-000000000002', 'SHARED-ALIAS', 'sharedalias'),
  ('bbbbbbbb-0006-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0005-4000-8000-000000000002', 'SHARED-ALIAS', 'sharedalias');

INSERT INTO merged_names (id, workspace_id, organization_id, printed_name, match_key) VALUES
  ('aaaaaaaa-0007-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0005-4000-8000-000000000002', 'SAFE-A-ALIAS', 'safeaalias'),
  ('bbbbbbbb-0007-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0005-4000-8000-000000000002', 'LEAK-B-ALIAS', 'leakbalias'),
  ('aaaaaaaa-0007-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0005-4000-8000-000000000002', 'SHARED-ALIAS', 'sharedalias'),
  ('bbbbbbbb-0007-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0005-4000-8000-000000000002', 'SHARED-ALIAS', 'sharedalias');

INSERT INTO meanings (id, workspace_id, value_type, name, match_key) VALUES
  ('aaaaaaaa-0008-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'number', 'SAFE-A-MEANING', 'safeameaning'),
  ('bbbbbbbb-0008-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'number', 'LEAK-B-MEANING', 'leakbmeaning'),
  ('aaaaaaaa-0008-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'number', 'SHARED-MEANING', 'sharedmeaning'),
  ('bbbbbbbb-0008-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'number', 'SHARED-MEANING', 'sharedmeaning');

INSERT INTO document_templates (id, workspace_id, name, name_key, kind, issuer_organization_id, description, stage, created_by_user_id) VALUES
  ('aaaaaaaa-0009-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'SAFE-A-TEMPLATE', 'safeatemplate', 'weigh-ticket', 'aaaaaaaa-0005-4000-8000-000000000002', 'SAFE-A-TEMPLATE-DESCRIPTION', 'dispatch', 'aaaaaaaa-0001-4000-8000-000000000001'),
  ('bbbbbbbb-0009-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'LEAK-B-TEMPLATE', 'leakbtemplate', 'weigh-ticket', 'bbbbbbbb-0005-4000-8000-000000000002', 'LEAK-B-TEMPLATE-DESCRIPTION', 'dispatch', 'bbbbbbbb-0001-4000-8000-000000000001'),
  ('aaaaaaaa-0009-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'SHARED-TEMPLATE', 'sharedtemplate', 'weigh-ticket', 'aaaaaaaa-0005-4000-8000-000000000002', 'SAFE-A-SHARED-TEMPLATE-DESCRIPTION', 'dispatch', 'aaaaaaaa-0001-4000-8000-000000000001'),
  ('bbbbbbbb-0009-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'SHARED-TEMPLATE', 'sharedtemplate', 'weigh-ticket', 'bbbbbbbb-0005-4000-8000-000000000002', 'LEAK-B-SHARED-TEMPLATE-DESCRIPTION', 'dispatch', 'bbbbbbbb-0001-4000-8000-000000000001'),
  ('bbbbbbbb-0009-4000-8000-000000000003', 'bbbbbbbb-0002-4000-8000-000000000001', 'TARGET-B-TEMPLATE-ONLY', 'targetbtemplateonly', 'weigh-ticket', 'bbbbbbbb-0005-4000-8000-000000000002', 'LEAK-B-TEMPLATE-ONLY-DESCRIPTION', 'dispatch', 'bbbbbbbb-0001-4000-8000-000000000001');

INSERT INTO document_template_fields (id, workspace_id, template_id, position, name, name_key, value_type, unit) VALUES
  ('aaaaaaaa-0010-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0009-4000-8000-000000000001', 1, 'SAFE-A-FIELD', 'safeafield', 'number', 'kg'),
  ('bbbbbbbb-0010-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0009-4000-8000-000000000001', 1, 'LEAK-B-FIELD', 'leakbfield', 'number', 'kg');

INSERT INTO documents (id, workspace_id, kind, stage, document_number, document_date, title, vehicle_plate, summary, driver_user_id, template_id) VALUES
  ('aaaaaaaa-0011-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'weigh-ticket', 'dispatch', 'SHARED0001', '2026-03-01', 'SAFE-A-DOC Phiếu cân', '99Z12345', 'SAFE-A-DOC phiếu cân xe 99Z12345', 'aaaaaaaa-0001-4000-8000-000000000002', 'aaaaaaaa-0009-4000-8000-000000000001'),
  ('bbbbbbbb-0011-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'weigh-ticket', 'dispatch', 'SHARED0001', '2026-03-01', 'LEAK-B-DOC Phiếu cân', '99Z12345', 'LEAK-B-DOC phiếu cân xe 99Z12345', 'aaaaaaaa-0001-4000-8000-000000000002', 'bbbbbbbb-0009-4000-8000-000000000001'),
  ('bbbbbbbb-0011-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'LEAK-B-KIND', 'dispatch', NULL, '2026-03-01', 'LEAK-B-ONLY-DOC', NULL, 'LEAK-B-ONLY-DOC', NULL, NULL);

INSERT INTO document_lines (id, workspace_id, document_id, line_no, label, value, number, unit, meaning_id) VALUES
  ('aaaaaaaa-0012-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0011-4000-8000-000000000001', 0, 'SAFE-A-LINE', 'SAFE-A-LINE 12500 kg', 12500, 'kg', 'aaaaaaaa-0008-4000-8000-000000000001'),
  ('bbbbbbbb-0012-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0011-4000-8000-000000000001', 0, 'LEAK-B-LINE', 'LEAK-B-LINE 987654 kg', 987654, 'kg', 'bbbbbbbb-0008-4000-8000-000000000001'),
  ('aaaaaaaa-0012-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0011-4000-8000-000000000001', 1, 'SAFE-A-SHARED-LINE', 'SAFE-A-SHARED-LINE 700 kg', 700, 'kg', 'aaaaaaaa-0008-4000-8000-000000000002'),
  ('bbbbbbbb-0012-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0011-4000-8000-000000000001', 1, 'LEAK-B-SHARED-LINE', 'LEAK-B-SHARED-LINE 7777777 kg', 7777777, 'kg', 'bbbbbbbb-0008-4000-8000-000000000002'),
  ('bbbbbbbb-0012-4000-8000-000000000003', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0011-4000-8000-000000000002', 0, 'LEAK-B-ONLY-LINE', 'LEAK-B-ONLY-LINE', NULL, NULL, NULL);

INSERT INTO document_parties (id, workspace_id, document_id, role, type, printed_name, match_key, organization_id) VALUES
  ('aaaaaaaa-0013-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0011-4000-8000-000000000001', 'customer', 'company', 'SAFE-A-PARTY', 'safeaparty', 'aaaaaaaa-0005-4000-8000-000000000002'),
  ('bbbbbbbb-0013-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0011-4000-8000-000000000001', 'customer', 'company', 'LEAK-B-PARTY', 'leakbparty', 'bbbbbbbb-0005-4000-8000-000000000002'),
  ('aaaaaaaa-0013-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0011-4000-8000-000000000001', 'issuer', 'company', 'SHARED-COMPANY', 'sharedcompany', 'aaaaaaaa-0005-4000-8000-000000000001'),
  ('bbbbbbbb-0013-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0011-4000-8000-000000000001', 'issuer', 'company', 'SHARED-COMPANY', 'sharedcompany', 'bbbbbbbb-0005-4000-8000-000000000001');

INSERT INTO facts (id, workspace_id, author_user_id, statement, vehicle_plate, driver_user_id, customer_name, customer_match_key) VALUES
  ('aaaaaaaa-0014-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'SAFE-A-FACT Lương tài xế SAFE-A-WAGE mỗi chuyến', '99Z12345', 'aaaaaaaa-0001-4000-8000-000000000002', 'SAFE-A-CUSTOMER', 'safeacustomer'),
  ('bbbbbbbb-0014-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'LEAK-B-FACT Lương tài xế LEAK-B-WAGE mỗi chuyến', '99Z12345', 'aaaaaaaa-0001-4000-8000-000000000002', 'LEAK-B-CUSTOMER', 'leakbcustomer');

INSERT INTO fact_values (id, workspace_id, fact_id, position, name, match_key, number, unit) VALUES
  ('aaaaaaaa-0015-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0014-4000-8000-000000000001', 0, 'Lương', 'luong', 500000, 'vnd'),
  ('bbbbbbbb-0015-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0014-4000-8000-000000000001', 0, 'Lương', 'luong', 777000111, 'vnd');

INSERT INTO facts (id, workspace_id, author_user_id, statement, vehicle_plate, pickup_name, pickup_match_key) VALUES
  ('bbbbbbbb-0014-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'LEAK-B-ROUTE-FACT Lương xe 99Z12345 lấy hàng ở SHARED-COMPANY', '99Z12345', 'SHARED-COMPANY', 'sharedcompany');

INSERT INTO fact_values (id, workspace_id, fact_id, position, name, match_key, number, unit) VALUES
  ('bbbbbbbb-0015-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0014-4000-8000-000000000002', 0, 'Lương', 'luong', 888000222, 'vnd');

INSERT INTO fact_companies (id, workspace_id, fact_id, slot, organization_id) VALUES
  ('aaaaaaaa-0016-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0014-4000-8000-000000000001', 'customer', 'aaaaaaaa-0005-4000-8000-000000000001'),
  ('bbbbbbbb-0016-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0014-4000-8000-000000000001', 'customer', 'bbbbbbbb-0005-4000-8000-000000000001');

INSERT INTO document_facts (workspace_id, document_id, fact_id) VALUES
  ('aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0011-4000-8000-000000000001', 'aaaaaaaa-0014-4000-8000-000000000001'),
  ('bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0011-4000-8000-000000000001', 'bbbbbbbb-0014-4000-8000-000000000001');

INSERT INTO goods_names (id, workspace_id, author_user_id, written_name, match_key, shown_name) VALUES
  ('aaaaaaaa-0018-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'SHARED-GOODS', 'sharedgoods', 'SAFE-A-GOODS'),
  ('bbbbbbbb-0018-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'SHARED-GOODS', 'sharedgoods', 'LEAK-B-GOODS'),
  ('bbbbbbbb-0018-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'TARGET-B-GOODS-ONLY', 'targetbgoodsonly', 'LEAK-B-GOODS-ONLY-SHOWN');

INSERT INTO inbound_events (id, channel, account_id, external_event_id, external_user_id, kind, payload, status, processed_at) VALUES
  ('aaaaaaaa-0019-4000-8000-000000000001', 'zalo-oa', 'seed-oa', 'SAFE-A-EVENT-1', 'seed-zalo-driver', 'text', '{}', 'done', now()),
  ('aaaaaaaa-0019-4000-8000-000000000002', 'zalo-oa', 'seed-oa', 'SAFE-A-EVENT-2', 'seed-zalo-admin-a', 'images', '{}', 'done', now()),
  ('aaaaaaaa-0019-4000-8000-000000000003', 'zalo-oa', 'seed-oa', 'SAFE-A-EVENT-3', 'seed-zalo-admin-a', 'file', '{}', 'done', now()),
  ('bbbbbbbb-0019-4000-8000-000000000001', 'zalo-oa', 'seed-oa', 'LEAK-B-EVENT-1', 'seed-zalo-driver', 'text', '{}', 'done', now()),
  ('bbbbbbbb-0019-4000-8000-000000000002', 'zalo-oa', 'seed-oa', 'LEAK-B-EVENT-2', 'seed-zalo-admin-a', 'images', '{}', 'done', now()),
  ('bbbbbbbb-0019-4000-8000-000000000003', 'zalo-oa', 'seed-oa', 'LEAK-B-EVENT-3', 'seed-zalo-admin-b', 'file', '{}', 'done', now());

INSERT INTO messages (id, workspace_id, user_id, author, text, image_key, inbound_event_id, event_part, reply_to, reply_kind, submission_status, created_at) VALUES
  ('aaaaaaaa-0020-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'user', 'SAFE-A-MESSAGE phiếu cân xe 99Z12345', NULL, 'aaaaaaaa-0019-4000-8000-000000000001', 0, NULL, NULL, 'accepted', '2026-03-01 08:00:00+00'),
  ('aaaaaaaa-0020-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'user', 'SAFE-A-CAPTION', 'seed/safea-photo.jpg', 'aaaaaaaa-0019-4000-8000-000000000002', 0, NULL, NULL, 'accepted', '2026-03-01 08:00:00+00'),
  ('aaaaaaaa-0020-4000-8000-000000000003', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'bot', 'SAFE-A-REPLY', NULL, NULL, NULL, 'aaaaaaaa-0020-4000-8000-000000000002', 'answer', 'accepted', '2026-03-01 08:00:00+00'),
  ('aaaaaaaa-0020-4000-8000-000000000004', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'user', 'SAFE-A-FILE-CAPTION', NULL, 'aaaaaaaa-0019-4000-8000-000000000003', 0, NULL, NULL, 'accepted', '2026-03-01 08:00:00+00'),
  ('bbbbbbbb-0020-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'user', 'LEAK-B-MESSAGE phiếu cân xe 99Z12345', NULL, 'bbbbbbbb-0019-4000-8000-000000000001', 0, NULL, NULL, 'accepted', '2026-03-01 08:00:00+00'),
  ('bbbbbbbb-0020-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'user', 'LEAK-B-CAPTION', 'seed/LEAK-B-photo.jpg', 'bbbbbbbb-0019-4000-8000-000000000002', 0, NULL, NULL, 'accepted', '2026-03-01 08:00:00+00'),
  ('bbbbbbbb-0020-4000-8000-000000000003', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'bot', 'LEAK-B-REPLY', NULL, NULL, NULL, 'bbbbbbbb-0020-4000-8000-000000000002', 'answer', 'accepted', '2026-03-01 08:00:00+00'),
  ('bbbbbbbb-0020-4000-8000-000000000004', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'user', 'LEAK-B-FILE-CAPTION', NULL, 'bbbbbbbb-0019-4000-8000-000000000003', 0, NULL, NULL, 'accepted', '2026-03-01 08:00:00+00');

INSERT INTO records (id, workspace_id, user_id, message_id, item_index, sender_name, category, vehicle_plate, document_number, occurred_on, amount_vnd, summary, details, document_title, created_at) VALUES
  ('aaaaaaaa-0021-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'aaaaaaaa-0020-4000-8000-000000000001', 0, 'SAFE-A-DRIVER', 'phiếu cân', '99Z12345', 'SHARED0001', '2026-03-01', 1000000, 'SAFE-A-RECORD phiếu cân xe 99Z12345 gửi cho TARGET-B-WORKSPACE', '[{"label": "SAFE-A-LABEL", "value": "SAFE-A-VALUE"}]', 'SAFE-A-DOC Phiếu cân', '2026-03-01 08:00:00+00'),
  ('bbbbbbbb-0021-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'bbbbbbbb-0020-4000-8000-000000000001', 0, 'LEAK-B-DRIVER', 'phiếu cân', '99Z12345', 'SHARED0001', '2026-03-01', 987654321, 'LEAK-B-RECORD phiếu cân xe 99Z12345 gửi cho TARGET-B-WORKSPACE', '[{"label": "LEAK-B-LABEL", "value": "LEAK-B-VALUE"}]', 'LEAK-B-DOC Phiếu cân', '2026-03-01 08:00:00+00'),
  ('aaaaaaaa-0021-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'aaaaaaaa-0020-4000-8000-000000000001', 1, 'SAFE-A-DRIVER', 'bảo dưỡng', '99Z12345', NULL, '2026-03-02', 250000, 'SAFE-A-MAINTENANCE thay dầu máy xe 99Z12345', '[]', NULL, '2026-03-02 08:00:00+00'),
  ('bbbbbbbb-0021-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'bbbbbbbb-0020-4000-8000-000000000001', 1, 'LEAK-B-DRIVER', 'bảo dưỡng', '99Z12345', NULL, '2026-03-02', 750000, 'LEAK-B-MAINTENANCE thay dầu máy xe 99Z12345', '[]', NULL, '2026-03-02 08:00:00+00');

UPDATE records SET maintenance_item = 'dầu máy' WHERE id IN ('aaaaaaaa-0021-4000-8000-000000000002', 'bbbbbbbb-0021-4000-8000-000000000002');

INSERT INTO message_files (id, workspace_id, message_id, file_key, file_name, file_size_bytes, extension) VALUES
  ('aaaaaaaa-0022-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0020-4000-8000-000000000004', 'seed/safea-file.xlsx', 'safea-file.xlsx', 1024, 'xlsx'),
  ('bbbbbbbb-0022-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0020-4000-8000-000000000004', 'seed/LEAK-B-file.xlsx', 'LEAK-B-file.xlsx', 1024, 'xlsx');

INSERT INTO document_reads (id, workspace_id, message_id, outcome) VALUES
  ('aaaaaaaa-0023-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0020-4000-8000-000000000001', 'saved'),
  ('bbbbbbbb-0023-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0020-4000-8000-000000000001', 'saved');

INSERT INTO document_sources (id, workspace_id, document_id, message_id, item_index) VALUES
  ('aaaaaaaa-0024-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0011-4000-8000-000000000001', 'aaaaaaaa-0020-4000-8000-000000000001', 0),
  ('bbbbbbbb-0024-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0011-4000-8000-000000000001', 'bbbbbbbb-0020-4000-8000-000000000001', 0),
  ('aaaaaaaa-0024-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0011-4000-8000-000000000001', 'aaaaaaaa-0020-4000-8000-000000000002', 1),
  ('bbbbbbbb-0024-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0011-4000-8000-000000000001', 'bbbbbbbb-0020-4000-8000-000000000002', 1);

INSERT INTO reply_photos (workspace_id, reply_message_id, source_message_id) VALUES
  ('aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0020-4000-8000-000000000003', 'aaaaaaaa-0020-4000-8000-000000000002'),
  ('bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0020-4000-8000-000000000003', 'bbbbbbbb-0020-4000-8000-000000000002');

INSERT INTO member_facts (id, workspace_id, member_user_id, author_user_id, readers, fact) VALUES
  ('aaaaaaaa-0026-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'admins', 'SAFE-A-MEMBER-FACT'),
  ('bbbbbbbb-0026-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'bbbbbbbb-0001-4000-8000-000000000001', 'admins', 'LEAK-B-MEMBER-FACT'),
  ('aaaaaaaa-0026-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'admins', 'SHARED-MEMBER-FACT'),
  ('bbbbbbbb-0026-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000002', 'bbbbbbbb-0001-4000-8000-000000000001', 'admins', 'SHARED-MEMBER-FACT');

INSERT INTO private_memories (id, workspace_id, author_user_id, readers, fact) VALUES
  ('aaaaaaaa-0027-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'author', 'SAFE-A-MEMORY'),
  ('bbbbbbbb-0027-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'author', 'LEAK-B-MEMORY'),
  ('aaaaaaaa-0027-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'author', 'SHARED-MEMORY'),
  ('bbbbbbbb-0027-4000-8000-000000000002', 'bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'author', 'SHARED-MEMORY');

INSERT INTO pending_changes (id, workspace_id, user_id, calls) VALUES
  ('aaaaaaaa-0028-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', '[]'),
  ('bbbbbbbb-0028-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', '[{"name": "forget_all_member_facts", "arguments": {"member_id": "bbbbbbbb-0004-4000-8000-000000000002"}}]');

INSERT INTO scheduled_tasks (id, workspace_id, created_by, title, instruction, repeat, time_of_day, status, next_run_at) VALUES
  ('aaaaaaaa-0029-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'SAFE-A-TASK', 'SAFE-A-TASK-INSTRUCTION', 'daily', '09:00', 'active', '2026-03-10 02:00:00+00'),
  ('bbbbbbbb-0029-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'LEAK-B-TASK', 'LEAK-B-TASK-INSTRUCTION', 'daily', '09:00', 'active', '2026-03-11 02:00:00+00');

INSERT INTO outbound_messages (id, channel, account_id, external_user_id, kind, body, admin_membership_id, status, sent_at, scheduled_task_id) VALUES
  ('aaaaaaaa-0030-4000-8000-000000000001', 'zalo-oa', 'seed-oa', 'seed-zalo-admin-a', 'text', 'SAFE-A-OUTBOUND', 'aaaaaaaa-0004-4000-8000-000000000001', 'sent', now(), 'aaaaaaaa-0029-4000-8000-000000000001'),
  ('bbbbbbbb-0030-4000-8000-000000000001', 'zalo-oa', 'seed-oa', 'seed-zalo-admin-b', 'text', 'LEAK-B-OUTBOUND', 'bbbbbbbb-0004-4000-8000-000000000001', 'sent', now(), 'bbbbbbbb-0029-4000-8000-000000000001');

INSERT INTO workspace_rules (id, workspace_id, author_user_id, rule) VALUES
  ('aaaaaaaa-0031-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'SAFE-A-RULE'),
  ('bbbbbbbb-0031-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'LEAK-B-RULE');

INSERT INTO workspace_rules (workspace_id, author_user_id, rule)
SELECT 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0001-4000-8000-000000000001', 'LEAK-B-RULE-' || number
FROM generate_series(1, 49) AS number;

INSERT INTO template_backfills (id, workspace_id, template_id, template_revision, requested_by_user_id, status, document_ids, finished_at) VALUES
  ('aaaaaaaa-0032-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'aaaaaaaa-0009-4000-8000-000000000001', 1, 'aaaaaaaa-0001-4000-8000-000000000001', 'done', ARRAY['aaaaaaaa-0011-4000-8000-000000000001']::uuid[], now()),
  ('bbbbbbbb-0032-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'bbbbbbbb-0009-4000-8000-000000000001', 1, 'bbbbbbbb-0001-4000-8000-000000000001', 'done', ARRAY['bbbbbbbb-0011-4000-8000-000000000001']::uuid[], now());

INSERT INTO llm_calls (id, workspace_id, kind, model, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, cost_usd, credits, balance_after) VALUES
  ('aaaaaaaa-0033-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'chat_answer', 'seed-model', 100, 0, 0, 50, 0.001, 0.5, 100),
  ('bbbbbbbb-0033-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'chat_answer', 'seed-model', 100, 0, 0, 50, 0.001, 0.5, 200);

INSERT INTO credit_additions (id, workspace_id, credits, source, note, balance_after) VALUES
  ('aaaaaaaa-0034-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 100, 'starting_grant', 'SAFE-A-GRANT', 100),
  ('bbbbbbbb-0034-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 200, 'starting_grant', 'LEAK-B-GRANT', 200);

INSERT INTO workspace_invites (id, workspace_id, code_hash, display_name, role, created_by, expires_at) VALUES
  ('aaaaaaaa-0035-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000001', 'safea-invite-hash', 'SAFE-A-INVITEE', 'member', 'aaaaaaaa-0001-4000-8000-000000000001', '2030-01-01 00:00:00+00'),
  ('bbbbbbbb-0035-4000-8000-000000000001', 'bbbbbbbb-0002-4000-8000-000000000001', 'leakb-invite-hash', 'LEAK-B-INVITEE', 'member', 'bbbbbbbb-0001-4000-8000-000000000001', '2030-01-01 00:00:00+00');

INSERT INTO channel_connections (id, channel, account_id, access_token_encrypted, refresh_token_encrypted, access_expires_at, refresh_expires_at) VALUES
  ('aaaaaaaa-0036-4000-8000-000000000001', 'zalo-oa', 'seed-oa', 'seed-not-a-token', 'seed-not-a-token', '2030-01-01 00:00:00+00', '2030-01-01 00:00:00+00');
