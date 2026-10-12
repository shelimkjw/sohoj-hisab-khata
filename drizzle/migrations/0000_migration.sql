CREATE TABLE public.cloud_backups (
  recovery_key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cloud_backups TO service_role;
ALTER TABLE public.cloud_backups ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.save_cloud_backup(p_key text, p_data jsonb)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t timestamptz := now();
BEGIN
  IF p_key IS NULL OR length(p_key) <> 64 THEN RAISE EXCEPTION 'invalid key'; END IF;
  IF pg_column_size(p_data) > 20000000 THEN RAISE EXCEPTION 'too large'; END IF;
  INSERT INTO public.cloud_backups(recovery_key, data, updated_at) VALUES (p_key, p_data, t)
  ON CONFLICT (recovery_key) DO UPDATE SET data = EXCLUDED.data, updated_at = t;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public.get_cloud_backup(p_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('data', data, 'updated_at', updated_at)
  FROM public.cloud_backups WHERE recovery_key = p_key AND length(p_key) = 64;
$$;

REVOKE ALL ON FUNCTION public.save_cloud_backup(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cloud_backup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_cloud_backup(text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cloud_backup(text) TO anon, authenticated;