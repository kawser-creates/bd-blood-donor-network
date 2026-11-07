import { supabase } from './supabase';
import type { AuthApi } from './authFlows';

/**
 * Adapts the Supabase client to the small AuthApi used by the flows.
 * Only the public anon key is involved; Supabase itself sends the OTP email (template and SMTP are
 * configured in the Supabase dashboard, never in this code).
 */
export const authApi: AuthApi = {
  signInWithOtp: (args) => supabase.auth.signInWithOtp(args),
  verifyOtp: (args) => supabase.auth.verifyOtp(args),
};
