ALTER TABLE public.projects ADD COLUMN sharepoint_url text;

-- Keep the current signatures for old application versions and the CSV importer.
-- Only authenticated application routes, via the server role, can write the URL.
CREATE FUNCTION public.create_project_transaction(
    p_id uuid,
    p_demo boolean,
    p_client_id uuid,
    p_project_title text,
    p_project_description text,
    p_status_id uuid,
    p_project_manager_id uuid,
    p_field_manager_id uuid,
    p_sales_rep_id uuid,
    p_start_date date,
    p_delivery_date date,
    p_estimated_date date,
    p_scheduled_date date,
    p_install_project_no text,
    p_sf_opportunity_no text,
    p_documents text,
    p_budget_value numeric,
    p_client_contact_name text,
    p_client_contact_email text,
    p_client_contact_phone text,
    p_color text,
    p_notes text,
    p_created_by uuid,
    p_is_urgent boolean,
    p_priority_id uuid,
    p_risk_id uuid,
    p_category_ids uuid[],
    p_teams_involved_ids uuid[],
    p_partners_ids uuid[],
    p_forecast_date date,
    p_sharepoint_url text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO public, extensions, pg_temp
AS $$
DECLARE
    new_id UUID;
    cat_id UUID;
    t_id UUID;
    part_id UUID;
BEGIN
    new_id := COALESCE(p_id, uuid_generate_v4());

    -- Insert project row with only canonical scalar fields
    INSERT INTO public.projects (
        id, demo, client_id, project_title, project_description, sharepoint_url, status_id,
        category_id, project_manager_id, field_manager_id, sales_rep_id,
        start_date, delivery_date, estimated_date, scheduled_date, forecast_date,
        install_project_no, sf_opportunity_no, documents, budget_value,
        client_contact_name, client_contact_email, client_contact_phone,
        color, notes, created_by, is_urgent, version
    ) VALUES (
        new_id, p_demo, p_client_id, p_project_title, p_project_description, p_sharepoint_url, p_status_id,
        p_category_ids[1], p_project_manager_id, p_field_manager_id, p_sales_rep_id,
        p_start_date, p_delivery_date, p_estimated_date, p_scheduled_date, p_forecast_date,
        p_install_project_no, p_sf_opportunity_no, p_documents, p_budget_value,
        p_client_contact_name, p_client_contact_email, p_client_contact_phone,
        p_color, p_notes, p_created_by, COALESCE(p_is_urgent, FALSE), 1
    );

    -- Insert priority link
    IF p_priority_id IS NOT NULL THEN
        INSERT INTO public.project_priority_link (project_id, priority_id)
        VALUES (new_id, p_priority_id);
    END IF;

    -- Insert risk link
    IF p_risk_id IS NOT NULL THEN
        INSERT INTO public.project_risk_link (project_id, risk_id)
        VALUES (new_id, p_risk_id);
    END IF;

    -- Insert category links
    IF p_category_ids IS NOT NULL THEN
        FOREACH cat_id IN ARRAY p_category_ids LOOP
            INSERT INTO public.project_category_link (project_id, category_id)
            VALUES (new_id, cat_id);
        END LOOP;
    END IF;

    -- Insert teams links
    IF p_teams_involved_ids IS NOT NULL THEN
        FOREACH t_id IN ARRAY p_teams_involved_ids LOOP
            INSERT INTO public.project_teams_link (project_id, team_id)
            VALUES (new_id, t_id);
        END LOOP;
    END IF;

    -- Insert partners links
    IF p_partners_ids IS NOT NULL THEN
        FOREACH part_id IN ARRAY p_partners_ids LOOP
            INSERT INTO public.project_partners_link (project_id, partner_id)
            VALUES (new_id, part_id);
        END LOOP;
    END IF;

    RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_project_transaction(uuid, boolean, uuid, text, text, uuid, uuid, uuid, uuid, date, date, date, date, text, text, text, numeric, text, text, text, text, text, uuid, boolean, uuid, uuid, uuid[], uuid[], uuid[], date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_transaction(uuid, boolean, uuid, text, text, uuid, uuid, uuid, uuid, date, date, date, date, text, text, text, numeric, text, text, text, text, text, uuid, boolean, uuid, uuid, uuid[], uuid[], uuid[], date, text) TO service_role;

CREATE FUNCTION public.update_project_transaction(
    p_id uuid,
    p_demo boolean,
    p_client_id uuid,
    p_project_title text,
    p_project_description text,
    p_status_id uuid,
    p_project_manager_id uuid,
    p_field_manager_id uuid,
    p_sales_rep_id uuid,
    p_start_date date,
    p_delivery_date date,
    p_estimated_date date,
    p_scheduled_date date,
    p_completed_date date,
    p_install_project_no text,
    p_sf_opportunity_no text,
    p_documents text,
    p_budget_value numeric,
    p_client_contact_name text,
    p_client_contact_email text,
    p_client_contact_phone text,
    p_color text,
    p_notes text,
    p_is_urgent boolean,
    p_updated_by uuid,
    p_expected_version integer,
    p_priority_id uuid,
    p_risk_id uuid,
    p_category_ids uuid[],
    p_teams_involved_ids uuid[],
    p_partners_ids uuid[],
    p_forecast_date date,
    p_sharepoint_url text
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO public, extensions, pg_temp
AS $$
DECLARE
    current_v INT;
    next_v INT;
    cat_id UUID;
    t_id UUID;
    part_id UUID;
BEGIN
    -- Get current version and check concurrency
    SELECT version INTO current_v FROM public.projects WHERE id = p_id FOR UPDATE;
    IF current_v IS NULL THEN
        RAISE EXCEPTION 'Project not found';
    END IF;

    IF p_expected_version IS NOT NULL AND current_v <> p_expected_version THEN
        RAISE EXCEPTION 'Concurrency conflict: current version is %, expected %', current_v, p_expected_version;
    END IF;

    next_v := current_v + 1;

    -- Update projects
    UPDATE public.projects SET
        demo = p_demo,
        client_id = p_client_id,
        project_title = p_project_title,
        project_description = p_project_description,
        sharepoint_url = p_sharepoint_url,
        status_id = p_status_id,
        category_id = p_category_ids[1], -- scalar category_id field
        project_manager_id = p_project_manager_id,
        field_manager_id = p_field_manager_id,
        sales_rep_id = p_sales_rep_id,
        start_date = p_start_date,
        delivery_date = p_delivery_date,
        estimated_date = p_estimated_date,
        scheduled_date = p_scheduled_date,
        forecast_date = p_forecast_date,
        completed_date = p_completed_date,
        install_project_no = p_install_project_no,
        sf_opportunity_no = p_sf_opportunity_no,
        documents = p_documents,
        budget_value = p_budget_value,
        client_contact_name = p_client_contact_name,
        client_contact_email = p_client_contact_email,
        client_contact_phone = p_client_contact_phone,
        color = p_color,
        notes = p_notes,
        is_urgent = COALESCE(p_is_urgent, FALSE),
        version = next_v,
        updated_by = p_updated_by,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_id;

    -- Update priority link
    DELETE FROM public.project_priority_link WHERE project_id = p_id;
    IF p_priority_id IS NOT NULL THEN
        INSERT INTO public.project_priority_link (project_id, priority_id)
        VALUES (p_id, p_priority_id);
    END IF;

    -- Update risk link
    DELETE FROM public.project_risk_link WHERE project_id = p_id;
    IF p_risk_id IS NOT NULL THEN
        INSERT INTO public.project_risk_link (project_id, risk_id)
        VALUES (p_id, p_risk_id);
    END IF;

    -- Update category links
    DELETE FROM public.project_category_link WHERE project_id = p_id;
    IF p_category_ids IS NOT NULL THEN
        FOREACH cat_id IN ARRAY p_category_ids LOOP
            INSERT INTO public.project_category_link (project_id, category_id)
            VALUES (p_id, cat_id);
        END LOOP;
    END IF;

    -- Update team links
    DELETE FROM public.project_teams_link WHERE project_id = p_id;
    IF p_teams_involved_ids IS NOT NULL THEN
        FOREACH t_id IN ARRAY p_teams_involved_ids LOOP
            INSERT INTO public.project_teams_link (project_id, team_id)
            VALUES (p_id, t_id);
        END LOOP;
    END IF;

    -- Update partner links
    DELETE FROM public.project_partners_link WHERE project_id = p_id;
    IF p_partners_ids IS NOT NULL THEN
        FOREACH part_id IN ARRAY p_partners_ids LOOP
            INSERT INTO public.project_partners_link (project_id, partner_id)
            VALUES (p_id, part_id);
        END LOOP;
    END IF;

    RETURN next_v;
END;
$$;
REVOKE ALL ON FUNCTION public.update_project_transaction(uuid, boolean, uuid, text, text, uuid, uuid, uuid, uuid, date, date, date, date, date, text, text, text, numeric, text, text, text, text, text, boolean, uuid, integer, uuid, uuid, uuid[], uuid[], uuid[], date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_transaction(uuid, boolean, uuid, text, text, uuid, uuid, uuid, uuid, date, date, date, date, date, text, text, text, numeric, text, text, text, text, text, boolean, uuid, integer, uuid, uuid, uuid[], uuid[], uuid[], date, text) TO service_role;

NOTIFY pgrst, 'reload schema';
