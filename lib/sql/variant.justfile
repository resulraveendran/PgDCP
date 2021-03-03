interpolateShebangContent := "../interpolate-shebang-content.pl"
supplyRecipeJustFile := "../recipe-suppliers.justfile"

_pg-dcp-recipe +ARGS:
    @just -f {{supplyRecipeJustFile}} {{ARGS}}

# Generate psql SQL snippet to create a named variant's objects
psql-construct variant:
    #!/usr/bin/env {{interpolateShebangContent}}
    CREATE EXTENSION if not exists ltree;

    CREATE TABLE {{variant}}(
        id integer GENERATED BY DEFAULT AS IDENTITY,
        path ltree NOT NULL,
        name ltree NOT NULL,
        description text,
        active boolean NOT NULL DEFAULT TRUE,
        created_at timestamp with time zone NOT NULL default current_date,
        updated_at timestamp with time zone,
        deleted_at timestamp with time zone,
        CONSTRAINT {{variant}}_pk UNIQUE(id),
        CONSTRAINT {{variant}}_unq_row UNIQUE(path, name)
    );
    CREATE INDEX {{variant}}_path_idx ON {{variant}} USING gist (path);
    CREATE INDEX {{variant}}_name_idx ON {{variant}} USING gist (name);

    CREATE TABLE {{variant}}_sensitivity(
        id integer GENERATED BY DEFAULT AS IDENTITY,
        {{variant}}_id integer NOT NULL REFERENCES {{variant}} (id),
        sensitivity ltree NOT NULL,
        active boolean NOT NULL DEFAULT TRUE
    );
    CREATE INDEX {{variant}}_sensitivity_idx ON {{variant}}_sensitivity USING gist (sensitivity);

    CREATE TABLE {{variant}}_value_text(
        id integer GENERATED BY DEFAULT AS IDENTITY,
        {{variant}}_id integer NOT NULL REFERENCES {{variant}}(id),
        value text not null
    );

    CREATE TABLE {{variant}}_value_json(
        id integer GENERATED BY DEFAULT AS IDENTITY,
        {{variant}}_id integer NOT NULL REFERENCES {{variant}}(id),
        value JSONB not null
    );

    CREATE OR REPLACE VIEW {{variant}}_text AS
        select {{variant}}.id as {{variant}}_id,
               value, path, name, description,
               {{variant}}_value_text.id as text_value_id
          from {{variant}}, {{variant}}_value_text
         where {{variant}}.id = {{variant}}_value_text.etc_id 
           and active = true

    -- TODO: create functions to add/update/delete variants from tables

# Generate psql SQL snippet to drop all named variant objects
psql-destroy variant:
    #!/usr/bin/env {{interpolateShebangContent}}
    drop table if exists {{variant}}_sensitivity;
    drop table if exists {{variant}}_value_json;
    drop table if exists {{variant}}_value_text;
    drop table if exists {{variant}};
