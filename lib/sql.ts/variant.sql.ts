import * as mod from "../mod.ts";
import * as schemas from "../schemas.ts";

export function SQL(
  ctx: mod.DcpInterpolationContext,
  options?: mod.InterpolationContextStateOptions,
): mod.DcpInterpolationResult {
  const state = ctx.prepareState(
    ctx.prepareTsModuleExecution(import.meta.url),
    options || {
      schema: schemas.lifecycle,
      searchPath: [
        schemas.lifecycle.name,
        schemas.lib.name,
      ],
    },
  );
  return mod.SQL(ctx, state)`
    ${schemas.publicSchema.ltreeExtn.createSql(state)};
    CREATE OR REPLACE FUNCTION variant_sql(schemaName text, variantName text, defaultCtx text, defaultPath text) RETURNS text AS $$
    BEGIN
        return format($execBody$
            SET search_path TO ${
    ["%1$s", ...schemas.publicSchema.ltreeExtn.searchPath].join(", ")
  };

            CREATE TABLE %1$s.%2$s_store_prime(
                id integer GENERATED BY DEFAULT AS IDENTITY,
                nature ltree NOT NULL,
                context ltree default '%3$s',
                path ltree default '%4$s',
                name text NOT NULL,
                description text,
                active boolean NOT NULL DEFAULT TRUE,
                version integer NOT NULL DEFAULT 1,
                created_at timestamp with time zone NOT NULL default current_date,
                created_by name NOT NULL default current_user,
                updated_at timestamp with time zone,
                updated_by name,
                deleted_at timestamp with time zone,
                deleted_by name,
                CONSTRAINT %2$s_store_prime_pk UNIQUE(id),
                CONSTRAINT %2$s_store_prime_unq_row UNIQUE(nature, context, path, name, version)
            );
            CREATE INDEX %2$s_store_prime_nature_idx ON %1$s.%2$s_store_prime USING gist (nature);
            CREATE INDEX %2$s_store_prime_context_idx ON %1$s.%2$s_store_prime USING gist (context);
            CREATE INDEX %2$s_store_prime_path_idx ON %1$s.%2$s_store_prime USING gist (path);
            CREATE INDEX %2$s_store_prime_name_idx ON %1$s.%2$s_store_prime (path);

            CREATE TABLE %2$s_value_text(
                id integer GENERATED BY DEFAULT AS IDENTITY,
                %2$s_id integer NOT NULL REFERENCES %1$s.%2$s_store_prime(id),
                value text not null,
                CONSTRAINT %2$s_value_text_pk UNIQUE(id)
            );

            CREATE TABLE %1$s.%2$s_value_json(
                id integer GENERATED BY DEFAULT AS IDENTITY,
                %2$s_id integer NOT NULL REFERENCES %1$s.%2$s_store_prime(id),
                value JSONB not null,
                CONSTRAINT %2$s_value_json_pk UNIQUE(id)
            );

            CREATE TABLE %1$s.%2$s_value_xml(
                id integer GENERATED BY DEFAULT AS IDENTITY,
                %2$s_id integer NOT NULL REFERENCES %1$s.%2$s_store_prime(id),
                value XML not null,
                CONSTRAINT %2$s_value_xml_pk UNIQUE(id)
            );

            CREATE TABLE %1$s.%2$s_store_provenance(
                id integer GENERATED BY DEFAULT AS IDENTITY,
                %2$s_id integer NOT NULL REFERENCES %1$s.%2$s_store_prime(id),
                %2$s_text_id integer REFERENCES %1$s.%2$s_value_text(id),
                %2$s_json_id integer REFERENCES %1$s.%2$s_value_json(id),
                %2$s_xml_id integer REFERENCES %1$s.%2$s_value_xml(id),
                source_nature ltree NOT NULL,
                content_nature ltree NOT NULL,
                context ltree,
                source_url text NOT NULL,
                source_md5_hash uuid NOT NULL,
                human_readable_name text,
                provenance jsonb,
                auto_update jsonb,
                meta_data jsonb,
                created_at timestamp with time zone NOT NULL default current_date,
                created_by name NOT NULL default current_user,
                CONSTRAINT %2$s_store_provenance_pk UNIQUE(id),
                CONSTRAINT %2$s_store_provenance_unq_row UNIQUE(source_nature, content_nature, context, source_url, source_md5_hash)
            );
            CREATE INDEX %2$s_store_provenance_src_nature_idx ON %1$s.%2$s_store_provenance USING gist (source_nature);
            CREATE INDEX %2$s_store_provenance_content_nature_idx ON %1$s.%2$s_store_provenance USING gist (content_nature);
            CREATE INDEX %2$s_store_provenance_context_idx ON %1$s.%2$s_store_provenance USING gist (context);

            CREATE TABLE %1$s.%2$s_store_relationship(
                id integer GENERATED BY DEFAULT AS IDENTITY,
                nature ltree NOT NULL,
                context ltree default '%3$s',
                %2$s_left_id integer NOT NULL REFERENCES %1$s.%2$s_store_prime(id),
                %2$s_right_id integer NOT NULL REFERENCES %1$s.%2$s_store_prime(id),
                active boolean NOT NULL DEFAULT TRUE,
                version integer NOT NULL DEFAULT 1,
                relationship jsonb,
                meta_data jsonb,
                created_at timestamp with time zone NOT NULL default current_date,
                created_by name NOT NULL default current_user,
                updated_at timestamp with time zone,
                updated_by name,
                deleted_at timestamp with time zone,
                deleted_by name,
                CONSTRAINT %2$s_store_relationship_pk UNIQUE(id),
                CONSTRAINT %2$s_store_relationship_unq_row UNIQUE(nature, context, %2$s_left_id, %2$s_right_id, version)
            );
            CREATE INDEX %2$s_store_relationship_nature_idx ON %1$s.%2$s_store_relationship USING gist (nature);
            CREATE INDEX %2$s_store_relationship_context_idx ON %1$s.%2$s_store_relationship USING gist (context);
            CREATE INDEX %2$s_store_relationship_%2$s_left_id_idx ON %1$s.%2$s_store_relationship (%2$s_left_id);
            CREATE INDEX %2$s_store_relationship_%2$s_right_id_idx ON %1$s.%2$s_store_relationship (%2$s_right_id);

            CREATE OR REPLACE VIEW %1$s.%2$s_text AS
                select %2$s_store_prime.id as %2$s_id,
                    nature, value, context, path, name, description,
                    %2$s_value_text.id as value_id
                from %1$s.%2$s_store_prime, %1$s.%2$s_value_text
                where %2$s_store_prime.id = %2$s_value_text.%2$s_id 
                and active = true;
            
            create or replace function %1$s.variant_insert_%2$s_text() returns trigger as $genBody$
            declare
                %2$sId integer;
            begin
                insert into %1$s.%2$s_store_prime (nature, context, path, name, description) select 
                    (CASE WHEN (NEW.nature IS NULL) THEN 'text' ELSE NEW.nature END),
                    (CASE WHEN (NEW.context IS NULL) THEN '%3$s' ELSE NEW.context END),
                    (CASE WHEN (NEW.path IS NULL) THEN '%4$s' ELSE NEW.path END),
                    NEW.name,
                    NEW.description 
                    returning id into %2$sId;
                insert into %1$s.%2$s_value_text (%2$s_id, value) select %2$sId, NEW.value;
                return NEW;
            end;
            $genBody$ language plpgsql;
            
            create trigger variant_insert_%2$s_text_trigger
            instead of insert on %1$s.%2$s_text
            for each row execute function %1$s.variant_insert_%2$s_text();

            CREATE OR REPLACE VIEW %1$s.%2$s_json AS
                select %2$s_store_prime.id as %2$s_id,
                    nature, value, context, path, name, description,
                    %2$s_value_json.id as value_id
                from %1$s.%2$s_store_prime, %1$s.%2$s_value_json
                where %2$s_store_prime.id = %2$s_value_json.%2$s_id 
                and active = true;

            create or replace function %1$s.variant_insert_%2$s_json() returns trigger as $genBody$
            declare
                %2$sId integer;
            begin
                insert into %1$s.%2$s_store_prime (nature, context, path, name, description) select 
                    (CASE WHEN (NEW.nature IS NULL) THEN 'json' ELSE NEW.nature END),
                    (CASE WHEN (NEW.context IS NULL) THEN '%3$s' ELSE NEW.context END),
                    (CASE WHEN (NEW.path IS NULL) THEN '%4$s' ELSE NEW.path END),
                    NEW.name,
                    NEW.description 
                    returning id into %2$sId;
                insert into %1$s.%2$s_value_json (%2$s_id, value) select %2$sId, NEW.value;
                return NEW;
            end;
            $genBody$ language plpgsql;

            create trigger variant_insert_%2$s_json_trigger
            instead of insert on %1$s.%2$s_json
            for each row execute function %1$s.variant_insert_%2$s_json();

            CREATE OR REPLACE VIEW %1$s.%2$s_xml AS
                select %2$s_store_prime.id as %2$s_id,
                    nature, value, context, path, name, description,
                    %2$s_value_xml.id as value_id
                from %1$s.%2$s_store_prime, %1$s.%2$s_value_xml
                where %2$s_store_prime.id = %2$s_value_xml.%2$s_id 
                and active = true;

            create or replace function %1$s.variant_insert_%2$s_xml() returns trigger as $genBody$
            declare
                %2$sId integer;
            begin
                insert into _store_prime (nature, context, path, name, description) select 
                    (CASE WHEN (NEW.nature IS NULL) THEN 'xml' ELSE NEW.nature END),
                    (CASE WHEN (NEW.context IS NULL) THEN '%3$s' ELSE NEW.context END),
                    (CASE WHEN (NEW.path IS NULL) THEN '%4$s' ELSE NEW.path END),
                    NEW.name,
                    NEW.description 
                    returning id into %2$sId;
                insert into %1$s.%2$s_value_xml (%2$s_id, value) select %2$sId, NEW.value;
                return NEW;
            end;
            $genBody$ language plpgsql;

            create trigger variant_insert_%2$s_xml_trigger
            instead of insert on %1$s.%2$s_xml
            for each row execute function %1$s.variant_insert_%2$s_xml();

            CREATE OR REPLACE PROCEDURE ${
    schemas.lifecycle.qualifiedReference(
      "variant_%1$s_%2$s_destroy_all_objects",
    )
  }() AS $genBody$
            BEGIN
                -- TODO: also remove the triggers and other related items
                -- TODO: add cascades as necessary
                EXECUTE('drop view if exists %1$s.%2$s_json');
                EXECUTE('drop view if exists %1$s.%2$s_text');
                EXECUTE('drop view if exists %1$s.%2$s_xml');
                EXECUTE('drop table if exists %1$s.%2$s_value_json cascade');
                EXECUTE('drop table if exists %1$s.%2$s_value_text cascade');
                EXECUTE('drop table if exists %1$s.%2$s_value_xml cascade');
                EXECUTE('drop table if exists %1$s.%2$s_store_prime cascade');
            END;
            $genBody$ LANGUAGE PLPGSQL;
        $execBody$, schemaName, variantName, defaultCtx, defaultPath);
    END;
    $$ LANGUAGE PLPGSQL;
    
    CREATE OR REPLACE PROCEDURE variant_construct(schemaName text, variantName text, defaultCtx text, defaultPath text) AS $$
    BEGIN
        -- TODO: register execution in DCP Lifecyle log table
        EXECUTE(variant_sql(schemaName, variantName, defaultCtx, defaultPath));
    END;
    $$ LANGUAGE PLPGSQL;`;
}
