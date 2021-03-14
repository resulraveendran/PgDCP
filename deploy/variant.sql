CREATE EXTENSION IF NOT EXISTS ltree;

CREATE OR REPLACE FUNCTION ${ctx.fn.stateless('variant_sql')}(schemaName text, variantName text, defaultCtx text, defaultPath text) RETURNS text AS $$
BEGIN
    -- TODO: add qualified schema everywhere
    return format($execBody$
        CREATE TABLE %2$s(
            -- TODO: add checksums if importing files
            -- TODO: track provenance if importing files
            id integer GENERATED BY DEFAULT AS IDENTITY,
            nature ltree NOT NULL,
            context ltree NOT NULL,
            path ltree NOT NULL,
            name text NOT NULL,
            description text,
            sym_link_%2$s_id integer REFERENCES %2$s(id),
            active boolean NOT NULL DEFAULT TRUE,
            created_at timestamp with time zone NOT NULL default current_date,
            updated_at timestamp with time zone,
            deleted_at timestamp with time zone,
            CONSTRAINT %2$s_pk UNIQUE(id),
            CONSTRAINT %2$s_unq_row UNIQUE(context, path, name)
        );
        CREATE INDEX %2$s_nature_idx ON %2$s USING gist (nature);
        CREATE INDEX %2$s_context_idx ON %2$s USING gist (context);
        CREATE INDEX %2$s_path_idx ON %2$s USING gist (path);
        CREATE INDEX %2$s_name_idx ON %2$s (path);

        CREATE TABLE %2$s_sensitivity(
            id integer GENERATED BY DEFAULT AS IDENTITY,
            %2$s_id integer NOT NULL REFERENCES %2$s (id),
            sensitivity ltree NOT NULL,
            active boolean NOT NULL DEFAULT TRUE
        );
        CREATE INDEX %2$s_sensitivity_idx ON %2$s_sensitivity USING gist (sensitivity);

        CREATE TABLE %2$s_value_text(
            id integer GENERATED BY DEFAULT AS IDENTITY,
            %2$s_id integer NOT NULL REFERENCES %2$s(id),
            value text not null
        );

        CREATE TABLE %2$s_value_json(
            id integer GENERATED BY DEFAULT AS IDENTITY,
            %2$s_id integer NOT NULL REFERENCES %2$s(id),
            value JSONB not null
        );

        CREATE TABLE %2$s_value_xml(
            id integer GENERATED BY DEFAULT AS IDENTITY,
            %2$s_id integer NOT NULL REFERENCES %2$s(id),
            value XML not null
        );

        CREATE OR REPLACE VIEW %2$s_text AS
            select %2$s.id as %2$s_id,
                nature, value, context, path, name, description,
                %2$s_value_text.id as value_id
            from %2$s, %2$s_value_text
            where %2$s.id = %2$s_value_text.%2$s_id 
            and active = true;

        create or replace function insert_%2$s_text() returns trigger as $genBody$
        declare
            %2$sId integer;
        begin
            insert into %2$s (nature, context, path, name, description) select 
                (CASE WHEN (NEW.nature IS NULL) THEN 'text' ELSE NEW.nature END),
                (CASE WHEN (NEW.context IS NULL) THEN '%3$s' ELSE NEW.context END),
                (CASE WHEN (NEW.path IS NULL) THEN '%4$s' ELSE NEW.path END),
                NEW.name,
                NEW.description 
                returning id into %2$sId;
            insert into %2$s_value_text (%2$s_id, value) select %2$sId, NEW.value;
            return NEW;
        end;
        $genBody$ language plpgsql;

        create trigger insert_%2$s_text_trigger
        instead of insert on %2$s_text
        for each row execute function insert_%2$s_text();

        CREATE OR REPLACE VIEW %2$s_json AS
            select %2$s.id as %2$s_id,
                nature, value, context, path, name, description,
                %2$s_value_json.id as value_id
            from %2$s, %2$s_value_json
            where %2$s.id = %2$s_value_json.%2$s_id 
            and active = true;

        create or replace function insert_%2$s_json() returns trigger as $genBody$
        declare
            %2$sId integer;
        begin
            insert into %2$s (nature, context, path, name, description) select 
                (CASE WHEN (NEW.nature IS NULL) THEN 'json' ELSE NEW.nature END),
                (CASE WHEN (NEW.context IS NULL) THEN '%3$s' ELSE NEW.context END),
                (CASE WHEN (NEW.path IS NULL) THEN '%4$s' ELSE NEW.path END),
                NEW.name,
                NEW.description 
                returning id into %2$sId;
            insert into %2$s_value_json (%2$s_id, value) select %2$sId, NEW.value;
            return NEW;
        end;
        $genBody$ language plpgsql;

        create trigger insert_%2$s_json_trigger
        instead of insert on %2$s_json
        for each row execute function insert_%2$s_json();

        CREATE OR REPLACE VIEW %2$s_xml AS
            select %2$s.id as %2$s_id,
                nature, value, context, path, name, description,
                %2$s_value_xml.id as value_id
            from %2$s, %2$s_value_xml
            where %2$s.id = %2$s_value_xml.%2$s_id 
            and active = true;

        create or replace function insert_%2$s_xml() returns trigger as $genBody$
        declare
            %2$sId integer;
        begin
            insert into %2$s (nature, context, path, name, description) select 
                (CASE WHEN (NEW.nature IS NULL) THEN 'xml' ELSE NEW.nature END),
                (CASE WHEN (NEW.context IS NULL) THEN '%3$s' ELSE NEW.context END),
                (CASE WHEN (NEW.path IS NULL) THEN '%4$s' ELSE NEW.path END),
                NEW.name,
                NEW.description 
                returning id into %2$sId;
            insert into %2$s_value_xml (%2$s_id, value) select %2$sId, NEW.value;
            return NEW;
        end;
        $genBody$ language plpgsql;

        create trigger insert_%2$s_xml_trigger
        instead of insert on %2$s_xml
        for each row execute function insert_%2$s_xml();

        CREATE OR REPLACE PROCEDURE %2$s_destroy_all_objects() AS $genBody$
        BEGIN
            -- TODO: also remove the triggers and other related items
            -- TODO: add cascades as necessary
            EXECUTE('drop view if exists %2$s_json');
            EXECUTE('drop view if exists %2$s_text');
            EXECUTE('drop view if exists %2$s_xml');
            EXECUTE('drop table if exists %2$s_sensitivity cascade');
            EXECUTE('drop table if exists %2$s_value_json cascade');
            EXECUTE('drop table if exists %2$s_value_text cascade');
            EXECUTE('drop table if exists %2$s_value_xml cascade');
            EXECUTE('drop table if exists %2$s cascade');
        END;
        $genBody$ LANGUAGE PLPGSQL;
    $execBody$, schemaName, variantName, defaultCtx, defaultPath);
END;
$$ LANGUAGE PLPGSQL;

CREATE OR REPLACE PROCEDURE ${ctx.fn.stateless('construct_variant')}(schemaName text, variantName text, defaultCtx text, defaultPath text) AS $$
BEGIN
    -- TODO: register execution in DCP Lifecyle log table
    EXECUTE(${ctx.fn.stateless('variant_sql')}(schemaName, variantName, defaultCtx, defaultPath));
END;
$$ LANGUAGE PLPGSQL;

