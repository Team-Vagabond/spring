function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  supabaseUrl: req('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: req('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceKey: req('SUPABASE_SERVICE_ROLE_KEY'),
  llmBaseUrl: req('LLM_BASE_URL'),
  llmApiKey: req('LLM_API_KEY'),
  llmModelFast: process.env.LLM_MODEL_FAST || 'DeepSeek-V4-Flash',
  llmModelFrontier: process.env.LLM_MODEL_FRONTIER || 'gpt-5.5',
  shClientId: req('SH_CLIENT_ID'),
  shClientSecret: req('SH_CLIENT_SECRET'),
  shTokenUrl: process.env.SH_TOKEN_URL || 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
  shApiUrl: process.env.SH_API_URL || 'https://sh.dataspace.copernicus.eu/api/v1',
};
