-- Keep original source bytes for independent hash verification; old revisions stay explicit.
-- 保留原始来源内容以独立核验指纹，历史缺失不伪造。
ALTER TABLE process_registry ADD COLUMN input_format text NOT NULL DEFAULT 'normalized_json' CHECK(input_format IN ('normalized_json','bpmn_xml'));
ALTER TABLE process_registry ADD COLUMN raw_content text;
ALTER TABLE process_definition_revision ADD COLUMN input_format text NOT NULL DEFAULT 'normalized_json' CHECK(input_format IN ('normalized_json','bpmn_xml'));
ALTER TABLE process_definition_revision ADD COLUMN raw_content text;
